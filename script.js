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
        // Форматуємо дату відповідно до стилістики вашого сайту
        clockElement.innerText = now.toLocaleString('uk-UA', options).replace(',', '');
    }
}
// Запускаємо щосекундне оновлення
setInterval(updateClock, 1000);
updateClock();


// --- 2. ЛОГІКА ІГРОВОЇ ПЛАТФОРМИ ТА ІГОР ---
function startGame(gameType) {
    const modal = document.getElementById('game-modal');
    const container = document.getElementById('game-container');
    modal.style.display = 'block';

    if (gameType === 'harvest') {
        let score = 0;
        container.innerHTML = `
            <h2 style="color: #facc15; margin-bottom: 0.5rem; font-size: 1.8rem;">Збирай Врожай 🌾</h2>
            <p style="color: #94a3b8; font-size: 0.95rem; margin-bottom: 1.5rem;">Клікай на пшеницю якнайшвидше!</p>
            <div id="click-score" style="font-size: 2rem; margin: 1rem 0; font-weight: bold; color: #ffffff;">Зібрано: 0</div>
            
            <!-- Ігрова кнопка з ефектом плавного збільшення -->
            <button id="target-btn" style="font-size: 5rem; background: none; border: none; cursor: pointer; transition: transform 0.08s ease; display: inline-block; user-select: none;">🌾</button>
        `;

        const targetBtn = document.getElementById('target-btn');
        const scoreDisplay = document.getElementById('click-score');

        // Обробка кліку по пшениці
        targetBtn.onclick = () => {
            score++;
            scoreDisplay.innerText = `Зібрано: ${score}`;

            // Додаємо випадковий ефект нахилу та збільшення при кожному ударі
            const randomRotate = Math.random() * 24 - 12; // від -12 до +12 градусів
            targetBtn.style.transform = `scale(1.25) rotate(${randomRotate}deg)`;

            // Повертаємо початковий розмір після кліку
            setTimeout(() => {
                targetBtn.style.transform = 'none';
            }, 80);
        };
    }
}

// Функція закриття модального вікна (виходу з гри)
function closeGame() {
    document.getElementById('game-modal').style.display = 'none';
    document.getElementById('game-container').innerHTML = '';
}

// Закриття гри, якщо користувач клікнув на темне тло навколо ігрового вікна
window.onclick = function (event) {
    const modal = document.getElementById('game-modal');
    if (event.target == modal) {
        closeGame();
    }
}
