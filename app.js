// --- 状態管理 ---
let state = {
    game: 1,
    isOT: false,
    players: {
        A: { name: "", score: 0, credits: 2, roundPoints: 0, weapon: 0, serve: 0, hasOp: false },
        B: { name: "", score: 0, credits: 2, roundPoints: 0, weapon: 0, serve: 0, hasOp: false }
    }
};

const WEAPON_NAMES = { 0: "スリッパ", 2: "サブラケット", 4: "メインラケット" };
const SERVE_NAMES = { 0: "制限サーブ", 2: "サーブ自由" };

// --- 画面切り替え ---
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// --- 初期化 ---
document.getElementById('btn-start').addEventListener('click', () => {
    state.players.A.name = document.getElementById('playerA-name').value || "Player A";
    state.players.B.name = document.getElementById('playerB-name').value || "Player B";
    updateUI();
    showScreen('match-screen');
});

// --- スコア加算とメインロジック ---
function addPoint(scorerKey) {
    const scorer = state.players[scorerKey];
    const opponentKey = scorerKey === 'A' ? 'B' : 'A';
    const opponent = state.players[opponentKey];

    // オペレーターのドロップ＆得点計算ロジック
    let pointsToAdd = 1;

    if (scorer.hasOp) {
        // 自分がOPを持っていて得点した -> +2点維持
        pointsToAdd = 2;
    } else if (opponent.hasOp) {
        // 相手がOPを持っているのに自分が得点した -> 強奪（ドロップ）して+2点
        pointsToAdd = 2;
        opponent.hasOp = false;
        scorer.hasOp = true;
        alert(`${scorer.name} がオペレーターを奪取しました！`);
    }

    scorer.score += pointsToAdd;
    scorer.roundPoints += pointsToAdd; // ラウンド報酬計算用

    updateUI();

    // 1. 勝敗判定 (11点以上 ＆ 2点差以上)
    if (scorer.score >= 11 && (scorer.score - opponent.score) >= 2) {
        document.getElementById('result-message').innerText = `${scorer.name} WINS GAME ${state.game}!`;
        showScreen('result-screen');
        return;
    }

    // 2. オーバータイム判定 (10 - 10)
    if (state.players.A.score === 10 && state.players.B.score === 10 && !state.isOT) {
        triggerOvertime();
        return;
    }

    // 3. バイフェーズ判定 (合計得点が6の倍数)
    const totalScore = state.players.A.score + state.players.B.score;
    if (!state.isOT && totalScore % 6 === 0) {
        triggerBuyPhase();
    }
}

// --- バイフェーズ処理 ---
function triggerBuyPhase() {
    // ラウンド報酬の計算 (6ポイント中、誰が何点取ったか)
    ['A', 'B'].forEach(key => {
        const p = state.players[key];
        if (p.roundPoints >= 4) {
            p.credits = Math.min(9, p.credits + 5); // 勝利
        } else if (p.roundPoints <= 2) {
            p.credits = Math.min(9, p.credits + 3); // 敗北
        } else {
            p.credits = Math.min(9, p.credits + 4); // 引き分け (3-3)
        }
        p.roundPoints = 0; // 次の6ポイントに向けてリセット
    });

    // ショップ画面に反映
    document.getElementById('shop-credits-A').innerText = state.players.A.credits;
    document.getElementById('shop-credits-B').innerText = state.players.B.credits;
    document.getElementById('shop-name-A').innerText = state.players.A.name;
    document.getElementById('shop-name-B').innerText = state.players.B.name;

    showScreen('buy-screen');
}

// 購入確定ボタン
function confirmBuy() {
    // 実際にはここでクレジットの引き去り計算やバリデーションを行う
    // （ベーススクリプトのため、今回は選択した値をそのまま反映し、残金計算は省略/簡略化しています）
    
    ['A', 'B'].forEach(key => {
        const p = state.players[key];
        const weaponCost = parseInt(document.getElementById(`shop-weapon-${key}`).value);
        const serveCost = document.getElementById(`shop-serve-${key}`).checked ? 2 : 0;
        const opCost = document.getElementById(`shop-op-${key}`).checked ? 8 : 0;
        
        const totalCost = weaponCost + serveCost + opCost;
        
        if (totalCost > p.credits) {
            alert(`${p.name} のクレジットが足りません！初期装備で強制出撃します。`);
            p.weapon = 0; p.serve = 0; p.hasOp = false;
        } else {
            p.credits -= totalCost;
            p.weapon = weaponCost;
            p.serve = serveCost;
            p.hasOp = opCost > 0;
        }
        
        // ショップのリセット
        document.getElementById(`shop-serve-${key}`).checked = false;
        document.getElementById(`shop-op-${key}`).checked = false;
        document.getElementById(`shop-weapon-${key}`).value = "0";
    });

    updateUI();
    showScreen('match-screen');
}

// --- オーバータイム処理 ---
function triggerOvertime() {
    state.isOT = true;
    document.getElementById('ot-banner').classList.remove('hidden');
    
    // マネーリセット＆フルバイ強制（OPは禁止）
    ['A', 'B'].forEach(key => {
        state.players[key].credits = 9;
        state.players[key].weapon = 4; // メインラケット
        state.players[key].serve = 2; // サーブ自由
        state.players[key].hasOp = false;
    });
    
    alert("OVERTIME 突入！\n・両者フルバイ固定\n・1ポイントごとにコートとサーブ交代");
    updateUI();
}

// --- 次のゲームへ (スノーボール) ---
function nextGame() {
    state.game++;
    state.isOT = false;
    document.getElementById('ot-banner').classList.add('hidden');
    
    ['A', 'B'].forEach(key => {
        const p = state.players[key];
        p.score = 0;
        p.roundPoints = 0;
        p.hasOp = false;
        // クレジットはリセットしない（持ち越し）
        
        // ゲーム開始時はピストルラウンド状態に戻る（装備リセット）
        p.weapon = 0;
        p.serve = 0;
        
        // 0-0時は初期資金として+2追加する（任意ルール）
        p.credits = Math.min(9, p.credits + 2);
    });
    
    updateUI();
    showScreen('match-screen');
}

// --- UI更新 ---
function updateUI() {
    document.getElementById('game-count').innerText = state.game;

    ['A', 'B'].forEach(key => {
        const p = state.players[key];
        document.getElementById(`display-name-${key}`).innerText = p.name;
        document.getElementById(`score-${key}`).innerText = p.score;
        document.getElementById(`credits-${key}`).innerText = p.credits;
        document.getElementById(`equip-weapon-${key}`).innerText = WEAPON_NAMES[p.weapon];
        document.getElementById(`equip-serve-${key}`).innerText = SERVE_NAMES[p.serve];
        
        const opElement = document.getElementById(`op-${key}`);
        if (p.hasOp) {
            opElement.classList.add('active');
        } else {
            opElement.classList.remove('active');
        }
    });
}
