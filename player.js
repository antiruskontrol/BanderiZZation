/*
===================================================================
Версія:       1.0.2 (BanderiZZation! Hub — player.js)
Дата, час:    2026-10-22
Розробник:    Афтіпа Марко Оцтович | antiruskontrol@ukr.net
-------------------------------------------------------------------
Еволюція змін:
 Зміни 1.0.0:
  1. Спільна логіка для Кіноскопу (колекція movies) та Мультфільмоскопу
     (колекція cartoons). Колекція береться з <body data-collection="...">.
  2. ВИПРАВЛЕНО: змінна unsubscribeComments не була оголошена, через що
     коментарі не завантажувались, а лайк/закриття плеєра падали з помилкою.
  3. Коментарі прив'язані до фільму назавжди: підколекція
     {колекція}/{id фільму}/comments (замість мітки в тексті загальної
     колекції comments). Останні 50, нові зверху, живе оновлення.
  4. Пошта в списку замаскована; повна пошта — у закритій comment_emails.
  5. Безпека: усе виводиться через textContent (було innerHTML — XSS),
     відсутній опис не ламає картку, відео лише за https-посиланням.
  6. Лайк запам'ятовується на фільм у localStorage (анти-накрутка).
  7. Пауза 30 с між коментарями, поле-пастка від ботів.
  8. Плеєр закривається: кнопкою ×, Esc, кліком повз вікно та при
     переході на іншу сторінку (подія bz:leave) — відео зупиняється.
  9. Дебаг-принти [BZ-PLAYER] з описом маркера спрацювання.
 Зміни 1.0.1 відносно 1.0.0:
  1. Скрипт став звичайним (не type="module"), а Firebase підвантажується через
     import(): сторінка тепер працює і при відкритті з диска (file://), де Chrome
     блокує зовнішні модульні скрипти, і на GitHub Pages.
 Зміни 1.0.2 відносно 1.0.1 (Поточна версія):
  1. Оновлено рендеринг карток (renderCards) для відображення постерів.
     Тепер картка складається з обгортки .poster-wrapper (з картинкою 
     та статистикою) та текстового блоку .movie-text-block під нею.
  2. Додано підтримку поля posterUrl з Firebase. Якщо поля немає — 
     використовується локальна заглушка poster1.jfif.
===================================================================
*/

(async function () {
'use strict';

// Firebase підвантажується динамічно (працює і з file://, і з GitHub Pages)
let initializeApp, getFirestore, collection, doc, onSnapshot, updateDoc, increment,
    writeBatch, serverTimestamp, query, orderBy, limit;
try {
    ({ initializeApp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js"));
    ({
        getFirestore, collection, doc, onSnapshot, updateDoc, increment,
        writeBatch, serverTimestamp, query, orderBy, limit
    } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js"));
} catch (error) {
    console.log('[BZ-PLAYER] ПОМИЛКА завантаження Firebase SDK:', error && error.message ? error.message : error);
    return;
}

const TAG = '[BZ-PLAYER]';
const dbg = (msg, ...rest) => console.log(`${TAG} ${msg}`, ...rest);

const COL = document.body.dataset.collection;
const EMPTY_TEXT = document.body.dataset.empty || 'Поки що нічого немає...';

if (!COL) {
    dbg('ПОМИЛКА: у <body> немає data-collection — скрипт зупинено');
} else {
    start();
}

function start() {
    // Склейка назви проєкту (обхід затирання подвійного дефіса на GitHub)
    const part1 = 'banderizzation';
    const part2 = 'project';
    const projectId = part1 + '--' + part2;

    const app = initializeApp({
        apiKey: 'AIzaSyCJSp79_UdG6j9tLcWotrM5EBKSOjrybYI',
        authDomain: projectId + '.firebaseapp.com',
        projectId: projectId,
        messagingSenderId: '203896242149',
        appId: '1:203896242149:web:5d6c2de90f631edb84f90c'
    });
    const db = getFirestore(app);
    dbg(`Firebase ініціалізовано, колекція: ${COL}`);

    const MAX_LEN = 500;
    const COOLDOWN_MS = 30000;
    const LAST_SENT_KEY = 'bz_comment_last_sent'; // спільний ключ з comments.js
    const LIKED_KEY = `bz_liked_${COL}`;
    const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

    const $ = (id) => document.getElementById(id);
    const container = $('movies-container');
    const modal = $('videoModal');
    const iframe = $('playerIframe');
    const viewsEl = $('modalViews');
    const likesEl = $('modalLikes');
    const likeBtn = $('modalLikeBtn');
    const titleEl = $('modalTitle');
    const descEl = $('modalDescription');
    const emailInput = $('chatEmail');
    const textInput = $('chatText');
    const counterEl = $('charCounter');
    const honeypot = $('chatWebsite');
    const sendBtn = $('sendCommentBtn');
    const statusEl = $('chatStatus');
    const commentsList = $('modalCommentsList');
    const closeBtn = $('closePlayerBtn');

    // ===== СТАН =====
    let activeId = null;
    let unsubscribeComments = null;
    const itemsById = new Map();

    // ===== ДОПОМІЖНЕ =====
    function maskEmail(email) {
        const [local, domain] = email.split('@');
        const keep = local.length > 2 ? 2 : 1;
        return `${local.slice(0, keep)}***@${domain}`;
    }

    function setStatus(text, kind) {
        statusEl.textContent = text;
        statusEl.className = 'chat-status' + (kind ? ' ' + kind : '');
    }

    function safeVideoUrl(raw) {
        try {
            const url = new URL(raw);
            return url.protocol === 'https:' ? url.href : '';
        } catch (e) {
            return '';
        }
    }

    function getLastSent() {
        try { return Number(localStorage.getItem(LAST_SENT_KEY)) || 0; } catch (e) { return 0; }
    }
    function setLastSent(ts) {
        try { localStorage.setItem(LAST_SENT_KEY, String(ts)); } catch (e) { /* ігноруємо */ }
    }
    function getLiked() {
        try {
            const arr = JSON.parse(localStorage.getItem(LIKED_KEY) || '[]');
            return Array.isArray(arr) ? arr : [];
        } catch (e) { return []; }
    }
    function saveLiked(list) {
        try { localStorage.setItem(LIKED_KEY, JSON.stringify(list)); } catch (e) { /* ігноруємо */ }
    }

    // ===== СПИСОК КАРТОК (живе оновлення) =====
    function renderCards(snapshot) {
        container.replaceChildren();
        itemsById.clear();

        if (snapshot.empty) {
            const p = document.createElement('p');
            p.className = 'sub-text';
            p.textContent = EMPTY_TEXT;
            container.appendChild(p);
            dbg(`МАРКЕР: колекція «${COL}» порожня`);
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            itemsById.set(id, data);

            const card = document.createElement('div');
            card.className = 'movie-card';
            card.tabIndex = 0;
            card.setAttribute('role', 'button');

            // --- НОВА СТРУКТУРА КАРТКИ З ПОСТЕРОМ ---
            const posterSrc = data.posterUrl || 'poster1.jfif';
            const displayTitle = data.title || 'Без назви';
            // Витягуємо опис (або виводимо пустий рядок, якщо його немає)
            const descText = data.director || data.description || ''; 

            card.innerHTML = `
                <div class="poster-wrapper">
                    <img src="${posterSrc}" alt="${displayTitle}" class="movie-poster" onerror="this.src='poster1.jfif'">
                    <div class="movie-stats-overlay">
                        👁️ ${data.views || 0}  |  🔥 ${data.likes || 0}
                    </div>
                </div>
                <div class="movie-text-block">
                    <h3 class="movie-title-card">${displayTitle}</h3>
                    <p class="movie-desc">${descText}</p>
                </div>
            `;

            card.addEventListener('click', () => openPlayer(id));
            card.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openPlayer(id);
                }
            });
            container.appendChild(card);
        });

        // Якщо плеєр відкритий — оновлюємо лічильники на льоту
        if (activeId && itemsById.has(activeId)) {
            const data = itemsById.get(activeId);
            viewsEl.textContent = data.views || 0;
            likesEl.textContent = data.likes || 0;
        }
        dbg(`Список оновлено: ${itemsById.size} шт.`);
    }

    onSnapshot(collection(db, COL), renderCards, (error) => {
        dbg(`ПОМИЛКА читання колекції «${COL}»: ${error.code || ''} ${error.message || error}`);
        container.replaceChildren();
        const p = document.createElement('p');
        p.className = 'sub-text';
        p.textContent = 'Не вдалося завантажити список. Спробуйте оновити сторінку.';
        container.appendChild(p);
    });

    // ===== КОМЕНТАРІ ПІД ФІЛЬМОМ (підколекція) =====
    function renderComments(snapshot) {
        commentsList.replaceChildren();

        if (snapshot.empty) {
            const p = document.createElement('p');
            p.className = 'chat-empty';
            p.textContent = 'Коментарів ще немає. Будьте першим!';
            commentsList.appendChild(p);
            dbg('Коментарів до цього фільму ще немає');
            return;
        }

        snapshot.forEach((docSnap) => {
            const c = docSnap.data({ serverTimestamps: 'estimate' });

            const item = document.createElement('article');
            item.className = 'chat-comment';

            const meta = document.createElement('div');
            meta.className = 'chat-comment-meta';
            const who = document.createElement('span');
            who.textContent = c.maskedEmail || 'анонім';
            const when = document.createElement('span');
            when.textContent = c.createdAt
                ? c.createdAt.toDate().toLocaleString('uk-UA', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', hour12: false
                })
                : '';
            meta.append(who, when);

            const text = document.createElement('p');
            text.className = 'chat-comment-text';
            text.textContent = c.text || '';

            item.append(meta, text);
            commentsList.appendChild(item);
        });
        dbg(`Коментарі оновлено: ${snapshot.size} шт.`);
    }

    function loadComments(id) {
        if (unsubscribeComments) {
            unsubscribeComments();
            unsubscribeComments = null;
        }
        const q = query(collection(db, COL, id, 'comments'), orderBy('createdAt', 'desc'), limit(50));
        unsubscribeComments = onSnapshot(q, renderComments, (error) => {
            dbg(`ПОМИЛКА читання коментарів (${COL}/${id}): ${error.code || ''} ${error.message || error}`);
            commentsList.replaceChildren();
            const p = document.createElement('p');
            p.className = 'chat-empty';
            p.textContent = 'Не вдалося завантажити коментарі.';
            commentsList.appendChild(p);
        });
    }

    // ===== ВІДКРИТТЯ / ЗАКРИТТЯ ПЛЕЄРА =====
    function openPlayer(id) {
        const data = itemsById.get(id);
        if (!data) return;

        const videoUrl = safeVideoUrl(data.videoUrl);
        if (!videoUrl) {
            dbg(`МАРКЕР: у документа ${COL}/${id} немає коректного https-посилання videoUrl → плеєр не відкрито`);
            return;
        }

        activeId = id;
        titleEl.textContent = data.title || 'Без назви';
        descEl.textContent = data.description || '';
        viewsEl.textContent = data.views || 0;
        likesEl.textContent = data.likes || 0;
        iframe.src = videoUrl;

        // Скидаємо форму коментарів
        emailInput.value = '';
        textInput.value = '';
        honeypot.value = '';
        counterEl.textContent = `0 / ${MAX_LEN}`;
        setStatus('', '');

        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('player-open');
        dbg(`МАРКЕР: відкрито плеєр «${data.title}» (${COL}/${id})`);

        loadComments(id);

        const itemRef = doc(db, COL, id);
        updateDoc(itemRef, { views: increment(1) })
            .catch((error) => dbg(`ПОМИЛКА збільшення переглядів: ${error.code || ''} ${error.message || error}`));

        // Лайк: один на фільм (запам'ятовується в localStorage)
        const alreadyLiked = getLiked().includes(id);
        likeBtn.disabled = alreadyLiked;
        likeBtn.onclick = async () => {
            const list = getLiked();
            if (list.includes(id)) return;
            likeBtn.disabled = true;
            saveLiked([...list, id]);
            try {
                await updateDoc(itemRef, { likes: increment(1) });
                dbg(`МАРКЕР: лайк зараховано (${COL}/${id})`);
            } catch (error) {
                saveLiked(list);
                likeBtn.disabled = false;
                dbg(`ПОМИЛКА лайка: ${error.code || ''} ${error.message || error}`);
            }
        };
    }

    function closePlayer(reason) {
        if (!modal.classList.contains('is-open')) return;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('player-open');
        iframe.src = 'about:blank'; // зупиняємо відео та фоновий стрімінг
        if (unsubscribeComments) {
            unsubscribeComments();
            unsubscribeComments = null;
        }
        activeId = null;
        dbg(`МАРКЕР: плеєр закрито (причина: ${reason})`);
    }

    closeBtn.addEventListener('click', () => closePlayer('кнопка ×'));
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closePlayer('клік повз вікно');
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closePlayer('клавіша Esc');
    });
    window.addEventListener('bz:leave', () => closePlayer('перехід на іншу сторінку'));

    // ===== ВІДПРАВКА КОМЕНТАРЯ =====
    textInput.addEventListener('input', () => {
        counterEl.textContent = `${textInput.value.length} / ${MAX_LEN}`;
    });

    sendBtn.addEventListener('click', async () => {
        setStatus('', '');
        if (!activeId) return;

        if (honeypot.value.trim() !== '') {
            dbg('МАРКЕР: заповнено поле-пастку (honeypot) — схоже на бота, запис пропущено');
            setStatus('Коментар надіслано.', 'ok');
            textInput.value = '';
            counterEl.textContent = `0 / ${MAX_LEN}`;
            return;
        }

        const email = emailInput.value.trim();
        const text = textInput.value.trim();

        if (!EMAIL_RE.test(email) || email.length > 254) {
            dbg('Валідація не пройшла: некоректна пошта →', email);
            setStatus('Вкажіть коректну пошту, наприклад name@gmail.com.', 'err');
            return;
        }
        if (!text) {
            dbg('Валідація не пройшла: порожній текст коментаря');
            setStatus('Напишіть текст коментаря.', 'err');
            return;
        }
        if (text.length > MAX_LEN) {
            dbg(`Валідація не пройшла: текст ${text.length} символів, ліміт ${MAX_LEN}`);
            setStatus(`Коментар задовгий: максимум ${MAX_LEN} символів.`, 'err');
            return;
        }

        const wait = COOLDOWN_MS - (Date.now() - getLastSent());
        if (wait > 0) {
            dbg(`Валідація не пройшла: пауза між відправками, лишилось ${Math.ceil(wait / 1000)} с`);
            setStatus(`Зачекайте ${Math.ceil(wait / 1000)} с перед наступним коментарем.`, 'err');
            return;
        }

        sendBtn.disabled = true;
        setStatus('Надсилаємо…', '');

        try {
            const commentRef = doc(collection(db, COL, activeId, 'comments'));
            const emailRef = doc(db, 'comment_emails', commentRef.id);
            const batch = writeBatch(db);
            batch.set(commentRef, { maskedEmail: maskEmail(email), text: text, createdAt: serverTimestamp() });
            batch.set(emailRef, { email: email, createdAt: serverTimestamp() });
            await batch.commit();

            setLastSent(Date.now());
            dbg(`Збережено коментар ${COL}/${activeId}/comments/${commentRef.id} | у списку пошта: ${maskEmail(email)}`);
            setStatus('Дякуємо! Коментар надіслано.', 'ok');
            textInput.value = '';
            counterEl.textContent = `0 / ${MAX_LEN}`;
        } catch (error) {
            dbg(`ПОМИЛКА збереження коментаря: ${error.code || ''} ${error.message || error}`);
            setStatus('Не вдалося надіслати коментар. Спробуйте пізніше.', 'err');
        } finally {
            sendBtn.disabled = false;
        }
    });
}
})();
