/*
===================================================================
Версія:       2.0.0 (BanderiZZation! Hub — player.js)
Дата, час:    2026-10-29
Розробник:    Афтіпа Марко Оцтович | antiruskontrol@ukr.net
-------------------------------------------------------------------
Еволюція змін:
 Зміни 2.0.0 відносно 1.0.3:
  1. Повний перехід з Firebase на Supabase.
  2. Дані фільмів беруться з таблиці movies.
  3. Збережено логіку генерації тимчасових посилань (Presigned URL) 
     через сервер на Render для Backblaze B2.
===================================================================
*/

(async function () {
'use strict';

// Supabase підвантажується динамічно
let createClient;
try {
    ({ createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"));
} catch (error) {
    console.log('[BZ-PLAYER] ПОМИЛКА завантаження Supabase SDK:', error && error.message ? error.message : error);
    return;
}

const TAG = '[BZ-PLAYER]';
const dbg = (msg, ...rest) => console.log(`${TAG} ${msg}`, ...rest);

// !!! ВАЖЛИВО: Вставте сюди ваші дані з Supabase (Project Settings -> API) !!!
const SUPABASE_URL = 'https://bmwzzvrmkupwimhvzzqe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_AlkDR5OTAyQjce5VYnLFOg_RlENaNLu';

// !!! ВАЖЛИВО: Адреса вашого сервера на Render !!!
const BACKEND_URL = 'https://banderizzation-backend.onrender.com'; 

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const EMPTY_TEXT = document.body.dataset.empty || 'Поки що нічого немає...';

start();

function start() {
    dbg(`Supabase ініціалізовано`);

    const MAX_LEN = 500;
    const COOLDOWN_MS = 30000;
    const LAST_SENT_KEY = 'bz_comment_last_sent';
    const LIKED_KEY = `bz_liked_movies`;
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
    const itemsById = new Map();

    // ===== ДОПОМІЖНЕ =====
    function setStatus(text, kind) {
        statusEl.textContent = text;
        statusEl.className = 'chat-status' + (kind ? ' ' + kind : '');
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

    // ===== ОТРИМАННЯ ТИМЧАСОВОГО ПОСИЛАННЯ З RENDER =====
    async function fetchVideoUrl(fileName) {
        try {
            const response = await fetch(`${BACKEND_URL}/api/video-url?file=${encodeURIComponent(fileName)}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return data.url;
        } catch (error) {
            dbg('ПОМИЛКА отримання тимчасового посилання:', error);
            return null;
        }
    }

    // ===== СПИСОК КАРТОК =====
    async function loadMovies() {
        const { data: movies, error } = await supabase
            .from('movies')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            dbg(`ПОМИЛКА читання колекції movies:`, error);
            container.innerHTML = `<p class="sub-text">Не вдалося завантажити список. Спробуйте оновити сторінку.</p>`;
            return;
        }

        container.replaceChildren();
        itemsById.clear();

        if (!movies || movies.length === 0) {
            const p = document.createElement('p');
            p.className = 'sub-text';
            p.textContent = EMPTY_TEXT;
            container.appendChild(p);
            dbg(`МАРКЕР: таблиця movies порожня`);
            return;
        }

        movies.forEach((data) => {
            const id = data.id;
            itemsById.set(id, data);

            const card = document.createElement('div');
            card.className = 'movie-card';
            card.tabIndex = 0;
            card.setAttribute('role', 'button');

            const posterSrc = data.posterUrl || 'poster1.jfif';
            const displayTitle = data.title || 'Без назви';
            const descText = data.description || ''; 

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

        dbg(`Список оновлено: ${itemsById.size} шт.`);
    }

    loadMovies();

    // Слухаємо зміни в реальному часі (WebSockets)
    supabase.channel('custom-all-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movies' }, (payload) => {
          dbg('Зміна в базі даних, оновлюємо список...');
          loadMovies(); 
      })
      .subscribe();

    // ===== КОМЕНТАРІ (Тимчасово) =====
    function renderComments() {
        commentsList.innerHTML = '<p class="chat-empty">Коментарі тимчасово недоступні.</p>';
    }

    // ===== ВІДКРИТТЯ / ЗАКРИТТЯ ПЛЕЄРА =====
    async function openPlayer(id) {
        const data = itemsById.get(id);
        if (!data) return;

        const videoFileName = data.videoFileName; 
        if (!videoFileName) {
            alert('Для цього фільму ще не завантажено відео.');
            return;
        }

        titleEl.textContent = data.title || 'Без назви';
        descEl.textContent = data.description || '';
        viewsEl.textContent = data.views || 0;
        likesEl.textContent = data.likes || 0;
        iframe.src = 'about:blank';

        const secureUrl = await fetchVideoUrl(videoFileName);

        if (!secureUrl) {
            alert('Не вдалося отримати доступ до відео. Спробуйте пізніше.');
            return;
        }

        activeId = id;
        iframe.src = secureUrl;

        emailInput.value = '';
        textInput.value = '';
        honeypot.value = '';
        counterEl.textContent = `0 / ${MAX_LEN}`;
        setStatus('', '');
        renderComments();

        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('player-open');
        dbg(`МАРКЕР: відкрито плеєр «${data.title}»`);

        // Збільшення переглядів (Supabase)
        await supabase.rpc('increment_views', { row_id: id });
        data.views = (data.views || 0) + 1;
        viewsEl.textContent = data.views;

        // Лайк
        const alreadyLiked = getLiked().includes(id);
        likeBtn.disabled = alreadyLiked;
        likeBtn.onclick = async () => {
            const list = getLiked();
            if (list.includes(id)) return;
            likeBtn.disabled = true;
            saveLiked([...list, id]);
            
            await supabase.rpc('increment_likes', { row_id: id });
            data.likes = (data.likes || 0) + 1;
            likesEl.textContent = data.likes;
            dbg(`МАРКЕР: лайк зараховано`);
        };
    }

    function closePlayer(reason) {
        if (!modal.classList.contains('is-open')) return;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('player-open');
        iframe.src = 'about:blank'; 
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
        setStatus('Коментарі тимчасово вимкнено.', 'err');
    });
}
})();
