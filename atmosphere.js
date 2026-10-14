/*
===================================================================
Версія:       1.0.0 (BanderiZZation! Hub — atmosphere.js)
Дата, час:    2026-10-13 12:00
Розробник:    Афтіпа Марко Оцтович | antiruskontrol@ukr.net
-------------------------------------------------------------------
Еволюція змін:
 Зміни 1.0.0 (Поточна версія):
  1. Меню «Атмосфера»: чекбокс звуку, вибір композиції, повзунок гучності,
     чекбокс стрічки новин. Відкривається кліком, закривається кліком повз
     вікно або клавішею Esc (поява/зникнення 1.2 с — у style.css).
  2. Список композицій береться з папки sound у репозиторії через GitHub API
     (кеш 1 год), запасний варіант — sound/playlist.json.
  3. Музика продовжується між сторінками: запам'ятовуються трек, позиція
     та гучність; перед переходом звук плавно гасне (0.75 с), на новій
     сторінці плавно наростає.
  4. Якщо браузер блокує автозапуск — бейдж підказує «клік для звуку».
  5. Дебаг-принти [BZ-AUDIO] з описом маркера спрацювання.
===================================================================
*/

(function () {
    'use strict';

    const dbg = (msg, ...rest) => console.log(`[BZ-AUDIO] ${msg}`, ...rest);

    // ===== НАЛАШТУВАННЯ =====
    const GH = { owner: 'antiruskontrol', repo: 'BanderiZZation', path: 'sound', branch: 'main' };
    const AUDIO_EXT = /\.(mp3|ogg|wav|m4a)$/i;
    const PLAYLIST_TTL = 60 * 60 * 1000; // кеш списку композицій — 1 година
    const FADE_MS = 750;                 // плавність звуку між сторінками
    const KEY = {
        sound: 'bz_sound_on', track: 'bz_track', time: 'bz_time',
        volume: 'bz_volume', news: 'bz_news_on', playlist: 'bz_playlist_cache'
    };

    const store = {
        get(key, fallback) {
            try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; }
        },
        set(key, value) {
            try { localStorage.setItem(key, String(value)); } catch (e) { /* ігноруємо */ }
        }
    };

    // ===== ЕЛЕМЕНТИ =====
    const zone = document.getElementById('atmo-zone');
    const badge = document.getElementById('atmo-badge');
    const soundEl = document.getElementById('atmo-sound');
    const trackEl = document.getElementById('atmo-track');
    const volumeEl = document.getElementById('atmo-volume');
    const volumeValEl = document.getElementById('atmo-volume-val');
    const newsEl = document.getElementById('atmo-news');

    if (!zone || !badge || !soundEl || !trackEl || !volumeEl || !newsEl) {
        dbg('МАРКЕР: елементи меню «Атмосфера» не знайдено на сторінці — скрипт зупинено');
        return;
    }

    // ===== СТАН =====
    let soundOn = store.get(KEY.sound, '0') === '1';
    let volume = Math.min(1, Math.max(0, Number(store.get(KEY.volume, '0.5'))));
    if (Number.isNaN(volume)) volume = 0.5;
    let newsOn = store.get(KEY.news, '1') !== '0';
    let tracks = [];
    let index = -1;
    let blocked = false;
    let fadeFactor = 1;
    let fadeRaf = 0;

    const audio = new Audio();
    audio.preload = 'auto';

    function applyVolume() {
        audio.volume = Math.min(1, Math.max(0, volume * fadeFactor));
    }

    function fadeTo(target, ms) {
        cancelAnimationFrame(fadeRaf);
        const from = fadeFactor;
        const t0 = performance.now();
        const step = (now) => {
            const p = Math.min(1, (now - t0) / ms);
            fadeFactor = from + (target - from) * p;
            applyVolume();
            if (p < 1) fadeRaf = requestAnimationFrame(step);
        };
        fadeRaf = requestAnimationFrame(step);
    }

    function updateBadge() {
        if (blocked) badge.textContent = 'Атмосфера: 🔇 клік для звуку';
        else badge.textContent = soundOn ? 'Атмосфера: увімкнено 🔊' : 'Атмосфера: вимкнено 🔇';
    }

    function updateVolumeLabel() {
        volumeValEl.textContent = `${Math.round(volume * 100)}%`;
    }

    // ===== ВІДКРИТТЯ / ЗАКРИТТЯ МЕНЮ =====
    function setMenuOpen(open) {
        zone.classList.toggle('is-open', open);
        badge.setAttribute('aria-expanded', String(open));
    }

    badge.addEventListener('click', () => {
        const open = !zone.classList.contains('is-open');
        setMenuOpen(open);
        dbg(`МАРКЕР: клік по бейджу «Атмосфера» → меню ${open ? 'відкрито' : 'закрито'}`);
    });
    badge.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            badge.click();
        }
    });
    document.addEventListener('click', (event) => {
        if (!zone.contains(event.target) && zone.classList.contains('is-open')) {
            setMenuOpen(false);
            dbg('МАРКЕР: клік повз меню → меню закрито');
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && zone.classList.contains('is-open')) {
            setMenuOpen(false);
            dbg('МАРКЕР: клавіша Esc → меню закрито');
        }
    });

    // ===== СПИСОК КОМПОЗИЦІЙ =====
    function prettyName(fileName) {
        let name = fileName.replace(AUDIO_EXT, '');
        try { name = decodeURIComponent(name); } catch (e) { /* лишаємо як є */ }
        return name.replace(/_/g, ' ').trim();
    }

    function toTrack(fileName) {
        return { name: prettyName(fileName), url: `${GH.path}/${encodeURIComponent(fileName)}` };
    }

    async function loadPlaylist() {
        // 1) кеш
        try {
            const cached = JSON.parse(store.get(KEY.playlist, 'null'));
            if (cached && Array.isArray(cached.tracks) && cached.tracks.length && Date.now() - cached.ts < PLAYLIST_TTL) {
                dbg(`Список композицій із кешу: ${cached.tracks.length} шт.`);
                return cached.tracks;
            }
        } catch (e) { /* кеш пошкоджено — ігноруємо */ }

        // 2) GitHub API
        try {
            const api = `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${GH.path}?ref=${GH.branch}`;
            const response = await fetch(api);
            if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`);
            const list = await response.json();
            const found = list
                .filter((f) => f.type === 'file' && AUDIO_EXT.test(f.name))
                .map((f) => toTrack(f.name));
            if (!found.length) throw new Error('у папці sound немає аудіофайлів (mp3/ogg/wav/m4a)');
            store.set(KEY.playlist, JSON.stringify({ ts: Date.now(), tracks: found }));
            dbg(`Список композицій із GitHub API: ${found.length} шт.`);
            return found;
        } catch (error) {
            dbg(`МАРКЕР: GitHub API не спрацював → ${error.message}; пробуємо sound/playlist.json`);
        }

        // 3) запасний playlist.json
        try {
            const response = await fetch(`${GH.path}/playlist.json`);
            if (!response.ok) throw new Error(`playlist.json HTTP ${response.status}`);
            const arr = await response.json();
            const found = arr
                .map((x) => (typeof x === 'string' ? x : x && x.file))
                .filter((n) => n && AUDIO_EXT.test(n))
                .map((n) => toTrack(n));
            if (!found.length) throw new Error('playlist.json порожній');
            dbg(`Список композицій із playlist.json: ${found.length} шт.`);
            return found;
        } catch (error) {
            dbg(`МАРКЕР: запасний playlist.json не спрацював → ${error.message}`);
        }
        return [];
    }

    function renderTrackSelect() {
        trackEl.replaceChildren();
        if (!tracks.length) {
            const opt = document.createElement('option');
            opt.textContent = 'Немає композицій у папці sound';
            trackEl.appendChild(opt);
            trackEl.disabled = true;
            return;
        }
        trackEl.disabled = false;
        tracks.forEach((t, i) => {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = t.name;
            trackEl.appendChild(opt);
        });
    }

    // ===== ВІДТВОРЕННЯ =====
    function setTrack(i, startAt) {
        index = i;
        audio.src = tracks[i].url;
        store.set(KEY.track, tracks[i].url);
        trackEl.value = String(i);
        if (startAt > 0) {
            audio.addEventListener('loadedmetadata', () => {
                try { audio.currentTime = startAt; } catch (e) { /* ігноруємо */ }
            }, { once: true });
        }
    }

    function armUnlock() {
        const handler = () => {
            document.removeEventListener('pointerdown', handler, true);
            document.removeEventListener('keydown', handler, true);
            if (soundOn) {
                dbg('МАРКЕР: перша взаємодія користувача після блокування автозапуску → запускаємо звук');
                fadeFactor = 0;
                tryPlay('перший клік після блокування').then(() => fadeTo(1, FADE_MS));
            }
        };
        document.addEventListener('pointerdown', handler, true);
        document.addEventListener('keydown', handler, true);
    }

    async function tryPlay(reason) {
        if (!soundOn || index < 0) return;
        try {
            applyVolume();
            await audio.play();
            blocked = false;
            updateBadge();
            dbg(`Відтворення «${tracks[index].name}» (причина: ${reason}), гучність ${Math.round(volume * 100)}%`);
        } catch (error) {
            if (error && error.name === 'NotAllowedError') {
                blocked = true;
                updateBadge();
                dbg('МАРКЕР: браузер заблокував автозапуск (потрібен клік) — чекаємо першу взаємодію');
                armUnlock();
            } else {
                dbg(`ПОМИЛКА відтворення: ${(error && error.message) || error}`);
            }
        }
    }

    audio.addEventListener('ended', () => {
        if (!tracks.length) return;
        const next = (index + 1) % tracks.length;
        dbg(`МАРКЕР: трек закінчився → наступний «${tracks[next].name}»`);
        setTrack(next, 0);
        tryPlay('наступний трек по колу');
    });

    audio.addEventListener('error', () => {
        dbg(`ПОМИЛКА: не вдалося завантажити файл ${audio.src} (перевірте назву та наявність у папці sound)`);
    });

    let lastSaved = 0;
    audio.addEventListener('timeupdate', () => {
        const now = Date.now();
        if (now - lastSaved > 1000 && soundOn) {
            lastSaved = now;
            store.set(KEY.time, audio.currentTime);
        }
    });
    window.addEventListener('pagehide', () => {
        if (soundOn && index >= 0) store.set(KEY.time, audio.currentTime);
    });

    // Затухання перед переходом на іншу сторінку (подає common.js)
    window.addEventListener('bz:leave', (event) => {
        if (!audio.paused) {
            dbg(`МАРКЕР: початок переходу між сторінками → плавне затухання звуку ${event.detail.ms} мс`);
            store.set(KEY.time, audio.currentTime);
            fadeTo(0, event.detail.ms);
        }
    });

    // ===== ЕЛЕМЕНТИ КЕРУВАННЯ =====
    soundEl.addEventListener('change', () => {
        soundOn = soundEl.checked;
        store.set(KEY.sound, soundOn ? '1' : '0');
        dbg(`МАРКЕР: користувач ${soundOn ? 'увімкнув' : 'вимкнув'} звук`);
        if (soundOn) {
            if (index < 0) dbg('Немає композицій для відтворення (папка sound порожня або недоступна)');
            fadeFactor = 1;
            tryPlay('користувач увімкнув звук');
        } else {
            audio.pause();
            blocked = false;
        }
        updateBadge();
    });

    trackEl.addEventListener('change', () => {
        const i = Number(trackEl.value);
        if (!tracks[i]) return;
        dbg(`МАРКЕР: користувач обрав композицію «${tracks[i].name}»`);
        setTrack(i, 0);
        tryPlay('користувач обрав композицію');
    });

    volumeEl.addEventListener('input', () => {
        volume = Number(volumeEl.value) / 100;
        store.set(KEY.volume, volume);
        updateVolumeLabel();
        applyVolume();
    });
    volumeEl.addEventListener('change', () => {
        dbg(`МАРКЕР: користувач змінив гучність → ${Math.round(volume * 100)}%`);
    });

    newsEl.addEventListener('change', () => {
        newsOn = newsEl.checked;
        store.set(KEY.news, newsOn ? '1' : '0');
        dbg(`МАРКЕР: користувач ${newsOn ? 'увімкнув' : 'вимкнув'} стрічку новин`);
        window.dispatchEvent(new CustomEvent('bz:news-toggle', { detail: { on: newsOn } }));
    });

    // ===== СТАРТ =====
    soundEl.checked = soundOn;
    newsEl.checked = newsOn;
    volumeEl.value = String(Math.round(volume * 100));
    updateVolumeLabel();
    updateBadge();
    applyVolume();

    (async function start() {
        tracks = await loadPlaylist();
        renderTrackSelect();
        if (!tracks.length) {
            dbg('Композицій немає: додайте mp3 у папку sound репозиторію');
            return;
        }

        const savedUrl = store.get(KEY.track, '');
        let i = tracks.findIndex((t) => t.url === savedUrl);
        const startAt = i >= 0 ? Number(store.get(KEY.time, '0')) || 0 : 0;
        if (i < 0) i = 0;
        setTrack(i, startAt);

        if (soundOn) {
            fadeFactor = 0;
            applyVolume();
            tryPlay('відновлення збережених налаштувань').then(() => fadeTo(1, FADE_MS));
        }
    })();
})();
