/*
===================================================================
Версія:       1.0.8 (BanderiZZation! Logic Engine)
Дата, час:    2026-10-11 14:38
Розробник:    Афтіпа Марко Оцтович | antiruskontrol@ukr.net
-------------------------------------------------------------------
Еволюція змін:
 Зміни 1.0.1 - 1.0.6:
  [Архів оновлень годинника та інтеграції ігрового рушія]
 Зміни 1.0.7 відносно 1.0.6:
  1. Модальні вікна: додано керування кліками для вікна версії.
 Зміни 1.0.8 відносно 1.0.7 (Поточна версія):
  1. Керування інтерфейсом: видалено функції відкриття модального вікна 
     по кліку. Логіка переведена на CSS-події наведення (hover).
===================================================================
*/

let gameTimer = null; // Потік ігрового таймера

// --- 1. ОНОВЛЕННЯ ГОДИННИКА В РЕАЛЬНОМУ ЧАСІ ---
function updateClock() {
    const clockElement = document.getElementById('current-datetime');
    if (clockElement) {
        const now = new Date();
        const options = {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        };
        clockElement.innerText = now.toLocaleString('uk-UA', options).replace(',', '');
    }
}
setInterval(updateClock, 1000);
updateClock();

// --- 2. РУШІЙ ГРИ: ЗБИРАЙ ВРОЖАЙ ---
function startGame(gameType) {
    const modal = document.getElementById('game-modal');
    const container = document.getElementById('game-container');
    modal.style.display = 'block';

    if (gameType === 'harvest') {
        clearInterval(gameTimer);
        let bestScore = localStorage.getItem('harvest_best_score') || 0;

        container.innerHTML = `
            <h2 style="color: #facc15; margin-bottom: 0.5rem; font-size: 1.8rem;">Збирай Врожай 🌾</h2>
            <p style="color: #94a3b8; font-size: 0.95rem; margin-bottom: 1rem;">Встигни наклікати якомога більше пшениці за 30 секунд!</p>
            <div style="font-size: 1.1rem; color: #3b82f6; margin-bottom: 1.5rem; font-weight: bold;">🏆 Особистий рекорд: ${bestScore}</div>
            <button id="start-game-btn" style="background: #16a34a; color: white; border: none; padding: 0.75rem 2rem; font-size: 1.1rem; font-weight: bold; border-radius: 8px; cursor: pointer; transition: background 0.2s;">Почати битву за врожай</button>
        `;

        document.getElementById('start-game-btn').onclick = () => {
            runHarvestEngine(container, bestScore);
        };
    }
}

function runHarvestEngine(container, bestScore) {
    let score = 0;
    let timeLeft = 30;

    container.innerHTML = `
        <h2 style="color: #facc15; margin-bottom: 0.5rem; font-size: 1.8rem;">Збирай Врожай 🌾</h2>
        <div style="display: flex; justify-content: space-around; font-size: 1.3rem; font-weight: bold; margin: 1rem 0;">
            <div id="game-time" style="color: #ef4444;">Час: 30с</div>
            <div id="click-score" style="color: #ffffff;">Зібрано: 0</div>
        </div>
        <button id="target-btn" style="font-size: 5.5rem; background: none; border: none; cursor: pointer; transition: transform 0.08s ease; display: inline-block; user-select: none; margin-top: 1rem;">🌾</button>
    `;

    const targetBtn = document.getElementById('target-btn');
    const scoreDisplay = document.getElementById('click-score');
    const timeDisplay = document.getElementById('game-time');

    targetBtn.onclick = () => {
        score++;
        scoreDisplay.innerText = `Зібрано: ${score}`;
        const randomRotate = Math.random() * 24 - 12;
        targetBtn.style.transform = `scale(1.25) rotate(${randomRotate}deg)`;
        setTimeout(() => targetBtn.style.transform = 'none', 80);
    };

    gameTimer = setInterval(() => {
        timeLeft--;
        timeDisplay.innerText = `Час: ${timeLeft}с`;

        if (timeLeft <= 0) {
            clearInterval(gameTimer);
            endHarvestGame(container, score, bestScore);
        }
    }, 1000);
}

function endHarvestGame(container, score, bestScore) {
    let isNewRecord = score > bestScore;
    if (isNewRecord) {
        localStorage.setItem('harvest_best_score', score);
        bestScore = score;
    }

    container.innerHTML = `
        <h2 style="color: #ef4444; margin-bottom: 0.5rem; font-size: 2rem;">Час вийшов! ⏱️</h2>
        <p style="font-size: 1.2rem; margin: 1rem 0; color: #ffffff;">Твій результат: <span style="color: #facc15; font-weight: bold; font-size: 1.5rem;">${score}</span> мішків пшениці</p>
        
        ${isNewRecord ?
            `<div style="color: #22c55e; font-size: 1.3rem; font-weight: bold; margin-bottom: 1.5rem; text-shadow: 0 0 10px rgba(34, 197, 94, 0.3);">🎉 Новий рекорд екосистеми!</div>` :
            `<div style="color: #94a3b8; font-size: 1rem; margin-bottom: 1.5rem;">Найкращий результат: \${bestScore}</div>`
        }

        <h3 style="color: #3b82f6; margin-bottom: 1.5rem; font-size: 1.4rem;">🌾 Слава Україні! Героям Слава! 🇺🇦</h3>
        
        <div style="display: flex; gap: 1rem; justify-content: center;">
            <button onclick="startGame('harvest')" style="background: #3b82f6; color: white; border: none; padding: 0.6rem 1.5rem; font-size: 1rem; font-weight: bold; border-radius: 6px; cursor: pointer;">Зібрати ще раз</button>
            <button onclick="closeGame()" style="background: #475569; color: white; border: none; padding: 0.6rem 1.5rem; font-size: 1rem; font-weight: bold; border-radius: 6px; cursor: pointer;">До хабу</button>
        </div>
    `;
}

function closeGame() {
    clearInterval(gameTimer);
    document.getElementById('game-modal').style.display = 'none';
    document.getElementById('game-container').innerHTML = '';
}

window.onclick = function (event) {
    const gameModal = document.getElementById('game-modal');
    if (event.target == gameModal) { closeGame(); }
}
