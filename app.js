// Firebase v9 モジュラーSDKのインポート
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ⚠️ ここにご自身のFirebaseコンソールから取得したConfigを貼り付けてください
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Firebase初期化
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- 状態管理 ---
let participants = [];
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

// --- タブ切り替え制御 ---
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.screen:not(.overlay)').forEach(s => s.classList.remove('active'));
        
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.target).classList.add('active');
    });
});

// --- Firestore: 参加者登録処理 ---
document.getElementById('btn-register').addEventListener('click', async () => {
    const name = document.getElementById('reg-name').value;
    const rank = parseInt(document.getElementById('reg-rank').value);
    
    if(!name || !rank) return alert("名前とランキングを入力してください");

    try {
        await addDoc(collection(db, "participants"), { name: name, rank: rank });
        alert("登録しました！");
        document.getElementById('reg-name').value = "";
        document.getElementById('reg-rank').value = "";
        fetchParticipants();
    } catch (e) {
        console.error("Error adding document: ", e);
    }
});

async function fetchParticipants() {
    const q = query(collection(db, "participants"), orderBy("rank", "asc"));
    const querySnapshot = await getDocs(q);
    participants = [];
    const ul = document.getElementById('players-ul');
    ul.innerHTML = "";
    
    querySnapshot.forEach((doc) => {
        const p = doc.data();
        participants.push(p);
        ul.innerHTML += `<li>${p.rank}位: ${p.name}</li>`;
    });
    
    document.getElementById('player-count').innerText = participants.length;
    
    if(participants.length >= 6) {
        document.getElementById('btn-generate-bracket').classList.remove('hidden');
    }
}
// 初期ロード時にリスト取得
fetchParticipants();

// --- ブラケット（トーナメント表）生成 ---
document.getElementById('btn-generate-bracket').addEventListener('click', () => {
    if(participants.length < 6) return alert("6名必要です");
    
    const container = document.getElementById('bracket-container');
    container.innerHTML = "";
    
    // VCTプレイオフフォーマット (6名)
    const matches = [
        { id: 1, title: "ノックアウト 1", pA: participants[2], pB: participants[5] }, // 3位 vs 6位
        { id: 2, title: "ノックアウト 2", pA: participants[3], pB: participants[4] }, // 4位 vs 5位
        { id: 3, title: "アッパー準決勝 A", pA: participants[0], pB: {name: "マッチ1の勝者"} }, // 1位待機
        { id: 4, title: "アッパー準決勝 B", pA: participants[1], pB: {name: "マッチ2の勝者"} }  // 2位待機
    ];

    matches.forEach(m => {
        const card = document.createElement('div');
        card.className = "matchup-card";
        card.innerHTML = `
            <div class="matchup-info">
                <h3>Match ${m.id}: ${m.title}</h3>
                <p>${m.pA.name} (アッパー優位) VS ${m.pB.name}</p>
            </div>
            <button class="btn-select-match" data-a="${m.pA.name}" data-b="${m.pB.name}">試合セット</button>
        `;
        container.appendChild(card);
    });

    // 試合選択ボタンのイベント
    document.querySelectorAll('.btn-select-match').forEach(btn => {
        btn.addEventListener('click', (e) => {
            setupMatch(e.target.dataset.a, e.target.dataset.b);
            // タブを「試合進行」に切り替え
            document.querySelector('[data-target="tab-match"]').click();
        });
    });
    
    // タブをブラケットに切り替え
    document.querySelector('[data-target="tab-bracket"]').click();
});

// --- 試合セットアップ ---
function setupMatch(nameA, nameB) {
    document.getElementById('match-setup').classList.remove('hidden');
    document.getElementById('match-active').classList.add('hidden');
    document.getElementById('current-match-title').innerText = `${nameA} vs ${nameB}`;
    
    state.players.A.name = nameA;
    state.players.B.name = nameB;
}

document.getElementById('btn-start-match').addEventListener('click', () => {
    document.getElementById('match-setup').classList.add('hidden');
    document.getElementById('match-active').classList.remove('hidden');
    // クレジットやスコアの初期化
    state.game = 1; state.isOT = false;
    ['A', 'B'].forEach(k => {
        state.players[k].score = 0; state.players[k].credits = 2;
        state.players[k].weapon = 0; state.players[k].serve = 0; state.players[k].hasOp = false;
    });
    updateUI();
});

// --- 試合進行・スコア加算 (HTMLから呼べるようにwindowに紐付け) ---
window.addPoint = function(scorerKey) {
    const scorer = state.players[scorerKey];
    const opponentKey = scorerKey === 'A' ? 'B' : 'A';
    const opponent = state.players[opponentKey];

    let pointsToAdd = 1;
    if (scorer.hasOp) pointsToAdd = 2;
    else if (opponent.hasOp) {
        pointsToAdd = 2; opponent.hasOp = false; scorer.hasOp = true;
        alert(`${scorer.name} がオペレーターを奪取！`);
    }

    scorer.score += pointsToAdd;
    scorer.roundPoints += pointsToAdd;

    updateUI();

    if (scorer.score >= 11 && (scorer.score - opponent.score) >= 2) {
        document.getElementById('result-message').innerText = `${scorer.name} WINS GAME ${state.game}!`;
        document.getElementById('result-screen').classList.add('active');
        return;
    }
    if (state.players.A.score === 10 && state.players.B.score === 10 && !state.isOT) {
        triggerOvertime();
        return;
    }
    if (!state.isOT && (state.players.A.score + state.players.B.score) % 6 === 0) {
        triggerBuyPhase();
    }
};

function triggerBuyPhase() {
    ['A', 'B'].forEach(key => {
        const p = state.players[key];
        if (p.roundPoints >= 4) p.credits = Math.min(9, p.credits + 5);
        else if (p.roundPoints <= 2) p.credits = Math.min(9, p.credits + 3);
        else p.credits = Math.min(9, p.credits + 4);
        p.roundPoints = 0;
    });

    document.getElementById('shop-credits-A').innerText = state.players.A.credits;
    document.getElementById('shop-credits-B').innerText = state.players.B.credits;
    document.getElementById('shop-name-A').innerText = state.players.A.name;
    document.getElementById('shop-name-B').innerText = state.players.B.name;

    document.getElementById('buy-screen').classList.add('active');
}

window.confirmBuy = function() {
    ['A', 'B'].forEach(key => {
        const p = state.players[key];
        const weaponCost = parseInt(document.getElementById(`shop-weapon-${key}`).value);
        const serveCost = document.getElementById(`shop-serve-${key}`).checked ? 2 : 0;
        const opCost = document.getElementById(`shop-op-${key}`).checked ? 8 : 0;
        
        const totalCost = weaponCost + serveCost + opCost;
        if (totalCost > p.credits) {
            alert(`${p.name} のクレジット不足！初期装備になります。`);
            p.weapon = 0; p.serve = 0; p.hasOp = false;
        } else {
            p.credits -= totalCost; p.weapon = weaponCost; p.serve = serveCost; p.hasOp = opCost > 0;
        }
        document.getElementById(`shop-serve-${key}`).checked = false;
        document.getElementById(`shop-op-${key}`).checked = false;
        document.getElementById(`shop-weapon-${key}`).value = "0";
    });
    updateUI();
    document.getElementById('buy-screen').classList.remove('active');
};

function triggerOvertime() {
    state.isOT = true;
    document.getElementById('ot-banner').classList.remove('hidden');
    ['A', 'B'].forEach(key => {
        state.players[key].credits = 9; state.players[key].weapon = 4;
        state.players[key].serve = 2; state.players[key].hasOp = false;
    });
    alert("OVERTIME 突入！\n・両者フルバイ固定\n・1ポイント交代");
    updateUI();
}

window.nextGame = function() {
    state.game++; state.isOT = false;
    document.getElementById('ot-banner').classList.add('hidden');
    ['A', 'B'].forEach(key => {
        const p = state.players[key];
        p.score = 0; p.roundPoints = 0; p.hasOp = false;
        p.weapon = 0; p.serve = 0;
        p.credits = Math.min(9, p.credits + 2); // 0-0資金追加
    });
    updateUI();
    document.getElementById('result-screen').classList.remove('active');
};

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
        p.hasOp ? opElement.classList.add('active') : opElement.classList.remove('active');
    });
}
