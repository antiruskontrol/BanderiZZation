function startGame(gameType) {
    const modal = document.getElementById('game-modal');
    const container = document.getElementById('game-container');
    modal.style.display = 'block';

    if (gameType === 'harvest') {
        let score = 0;
        container.innerHTML = `
            <h2>Гра: Збирай Врожай 🌾</h2>
            <p>Клікай на пшеницю якнайшвидше!</p>
            <div id="click-score" style="font-size: 1.5rem; margin: 1rem 0;">Рахунок: 0</div>
            <button id="target-btn" style="font-size: 3rem; background: none; border: none; cursor: pointer;">🌾</button>
        `;

        const targetBtn = document.getElementById('target-btn');
        const scoreDisplay = document.getElementById('click-score');

        targetBtn.onclick = () => {
            score++;
            scoreDisplay.innerText = `Рахунок: ${score}`;
            // Ефект випадкового зміщення кнопки, щоб гра була цікавішою
            targetBtn.style.transform = `scale(${1 + Math.random() * 0.3}) rotate(${Math.random() * 20 - 10}deg)`;
            setTimeout(() => targetBtn.style.transform = 'none', 100);
        };
    }
}

function closeGame() {
    document.getElementById('game-modal').style.display = 'none';
    document.getElementById('game-container').innerHTML = '';
}

// Закриття модалки при кліку поза нею
window.onclick = function(event) {
    const modal = document.getElementById('game-modal');
    if (event.target == modal) {
        closeGame();
    }
}
