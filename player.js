/*
===================================================================
Версія:       2.3.0 (BanderiZZation! Hub — player.js)
Дата, час:    2026-10-30
Розробник:    Афтіпа Марко Оцтович | antiruskontrol@ukr.net
-------------------------------------------------------------------
Еволюція змін:
 Зміни 2.3.0 відносно 2.2.0:
  1. Додано функцію cleanTitle, яка автоматично прибирає технологічні
     позначки (nologo, delogo, logo) та підкреслення з назв файлів
     перед відображенням на картках.
===================================================================
*/

(async function () {
'use strict';

let createClient;
try {
    ({ createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"));
} catch (error) {
    console.log('[BZ-PLAYER] ПОМИЛКА завантаження Supabase SDK:', error);
    return;
}

const TAG = '[BZ-PLAYER]';
const dbg = (msg, ...rest) => console.log(`${TAG} ${msg}`, ...rest);

// ВАШІ КЛЮЧІ SUPABASE
const SUPABASE_URL = 'https://bmwzzvrmkupwimhvzzqe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_AlkDR5OTAyQjce5VYnLFOg_RlENaNLu';

// АДРЕСА RENDER
const BACKEND_URL = 'https://banderizzation-backend.onrender.com'; 

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const EMPTY_TEXT = document.body.dataset.empty || 'Поки що нічого немає...';

// Визначаємо, з якими таблицями працювати
const COLLECTION = document.body.dataset.collection || 'movies';
const IS_CARTOON = COLLECTION === 'cartoons';
const TABLE_MOVIES = IS_CARTOON ? 'cartoons' : 'movies';
const TABLE_COMMENTS = IS_CARTOON ? 'cartoon_comments' : 'comments';
const ID_COLUMN = IS_CARTOON ? 'cartoon_id' : 'movie_id';

start();

function start() {
    dbg(`Supabase ініціалізовано. Колекція: ${TABLE_MOVIES}`);

    const MAX_LEN = 500;
    const COOLDOWN_MS = 30000;
    const LAST_SENT_KEY = 'bz_comment_last_sent';
    const LIKED_KEY = `bz_liked_${TABLE_MOVIES}`;
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

    let activeId = null;
    const itemsById = new Map();

    // === ФУНКЦІЯ ОЧИЩЕННЯ НАЗВИ ===
    function cleanTitle(rawTitle) {
        if (!rawTitle) return 'Без назви';
        return rawTitle
            .replace(/\.(mp4|mkv|avi|mov)$/i, '') // Прибираємо розширення
            .replace(/[_\s-]*(no|de)?logo[_\s-]*/gi, '') // Прибираємо logo, nologo, delogo
            .replace(/_/g, ' ') // Замінюємо підкреслення на пробіли
            .replace(/^\s+|\s+$/g, '') // Прибираємо пробіли на початку та в кінці
            .replace(/\s+/g, ' '); // Прибираємо подвійні пробіли
    }

    function maskEmail(email) {
        const [local, domain] = email.split('@');
        const keep = local.length > 2 ? 2 : 1;
        return `${local.slice(0, keep)}***@${domain}`;
    }

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
            .from(TABLE_MOVIES)
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            dbg(`ПОМИЛКА читання колекції ${TABLE_MOVIES}:`, error);
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
            // Використовуємо очищену назву
            const displayTitle = cleanTitle(data.title);
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
    }

    loadMovies();

    supabase.channel(`custom-all-channel-${TABLE_MOVIES}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE_MOVIES }, (payload) => {
          loadMovies(); 
      })
      .subscribe();

    // ===== КОМЕНТАРІ =====
    let commentChannel = null;

    async function loadComments(movieId) {
        commentsList.innerHTML = '<p class="chat-empty">Завантаження коментарів...</p>';
        
        const { data: comments, error } = await supabase
            .from(TABLE_COMMENTS)
            .select('*')
            .eq(ID_COLUMN, movieId)
            .order('created_at', { ascending: false });

        if (error) {
            dbg(`ПОМИЛКА читання коментарів (${TABLE_COMMENTS}):`, error);
            commentsList.innerHTML = '<p class="chat-empty">Не вдалося завантажити коментарі.</p>';
            return;
        }

        commentsList.replaceChildren();

        if (!comments || comments.length === 0) {
            commentsList.innerHTML = '<p class="chat-empty">Коментарів ще немає. Будьте першим!</p>';
            return;
        }

        comments.forEach((c) => {
            const item = document.createElement('article');
            item.className = 'chat-comment';

            const meta = document.createElement('div');
            meta.className = 'chat-comment-meta';
            
            const who = document.createElement('span');
            who.textContent = maskEmail(c.email || 'anon@example.com');
            
            const when = document.createElement('span');
            when.textContent = c.created_at
                ? new Date(c.created_at).toLocaleString('uk-UA', {
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

        if (commentChannel) supabase.removeChannel(commentChannel);
        commentChannel = supabase.channel(`comments-channel-${TABLE_COMMENTS}`)
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: TABLE_COMMENTS,
                filter: `${ID_COLUMN}=eq.${movieId}`
            }, (payload) => {
                loadComments(movieId);
            })
            .subscribe();
    }

    // ===== ВІДКРИТТЯ / ЗАКРИТТЯ ПЛЕЄРА =====
    async function openPlayer(id) {
        const data = itemsById.get(id);
        if (!data) return;

        const videoFileName = data.videoFileName; 
        
        if (!videoFileName) {
            alert('Для цього контенту ще не завантажено відео.');
            return;
        }

        titleEl.textContent = cleanTitle(data.title); // Очищена назва для плеєра
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

        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('player-open');

        loadComments(id);

        const viewRpc = IS_CARTOON ? 'increment_cartoon_views' : 'increment_views';
        await supabase.rpc(viewRpc, { row_id: id });
        data.views = (data.views || 0) + 1;
        viewsEl.textContent = data.views;

        const alreadyLiked = getLiked().includes(id);
        likeBtn.disabled = alreadyLiked;
        likeBtn.onclick = async () => {
            const list = getLiked();
            if (list.includes(id)) return;
            likeBtn.disabled = true;
            saveLiked([...list, id]);
            
            const likeRpc = IS_CARTOON ? 'increment_cartoon_likes' : 'increment_likes';
            await supabase.rpc(likeRpc, { row_id: id });
            data.likes = (data.likes || 0) + 1;
            likesEl.textContent = data.likes;
        };
    }

    function closePlayer(reason) {
        if (!modal.classList.contains('is-open')) return;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('player-open');
        iframe.src = 'about:blank'; 
        
        if (commentChannel) {
            supabase.removeChannel(commentChannel);
            commentChannel = null;
        }
        
        activeId = null;
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
            setStatus('Коментар надіслано.', 'ok');
            textInput.value = '';
            counterEl.textContent = `0 / ${MAX_LEN}`;
            return;
        }

        const email = emailInput.value.trim();
        const text = textInput.value.trim();

        if (!EMAIL_RE.test(email) || email.length > 254) {
            setStatus('Вкажіть коректну пошту, наприклад name@gmail.com.', 'err');
            return;
        }
        if (!text) {
            setStatus('Напишіть текст коментаря.', 'err');
            return;
        }
        if (text.length > MAX_LEN) {
            setStatus(`Коментар задовгий: максимум ${MAX_LEN} символів.`, 'err');
            return;
        }

        const wait = COOLDOWN_MS - (Date.now() - getLastSent());
        if (wait > 0) {
            setStatus(`Зачекайте ${Math.ceil(wait / 1000)} с перед наступним коментарем.`, 'err');
            return;
        }

        sendBtn.disabled = true;
        setStatus('Надсилаємо…', '');

        try {
            const insertData = { email: email, text: text };
            insertData[ID_COLUMN] = activeId;

            const { error } = await supabase
                .from(TABLE_COMMENTS)
                .insert([insertData]);

            if (error) throw error;

            setLastSent(Date.now());
            setStatus('Дякуємо! Коментар надіслано.', 'ok');
            textInput.value = '';
            counterEl.textContent = `0 / ${MAX_LEN}`;
            
            loadComments(activeId);

        } catch (error) {
            console.error('ПОМИЛКА збереження коментаря:', error);
            setStatus('Не вдалося надіслати коментар. Спробуйте пізніше.', 'err');
        } finally {
            sendBtn.disabled = false;
        }
    });
}
})();
