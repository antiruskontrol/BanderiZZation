/*
===================================================================
Версія:       1.0.0 (BanderiZZation! Hub — news.js)
Дата, час:    2026-10-13 12:00
Розробник:    Афтіпа Марко Оцтович | antiruskontrol@ukr.net
-------------------------------------------------------------------
Еволюція змін:
 Зміни 1.0.0 (Поточна версія):
  1. Стрічка новин у самому низу сторінки: розгортається знизу вгору за
     1.2 с, рухомий рядок із заголовками, пауза при наведенні мишки.
  2. Джерела RSS (список NEWS_FEEDS нижче) читаються через сервіс RSS2JSON;
     кеш у sessionStorage на 15 хв; кожне джерело незалежне — якщо одне
     не відповіло, решта працюють.
  3. Вмикається/вимикається чекбоксом у меню «Атмосфера» (подія
     bz:news-toggle від atmosphere.js, стан у localStorage: bz_news_on).
  4. Безпека: заголовки лише через textContent, посилання лише http(s).
  5. Дебаг-принти [BZ-NEWS] з описом маркера спрацювання.
===================================================================
*/

(function () {
    'use strict';

    const dbg = (msg, ...rest) => console.log(`[BZ-NEWS] ${msg}`, ...rest);

    // ===== ДЖЕРЕЛА НОВИН (RSS-адреси можна змінювати/додавати тут) =====
    // УВАГА: адреси потрібно перевірити в консолі — рядки [BZ-NEWS] покажуть,
    // яке джерело відповіло, а яке ні.
    const NEWS_FEEDS = [
        { name: 'Укрінформ', url: 'https://www.ukrinform.ua/rss/block-lastnews' },
        { name: 'УНІАН', url: 'https://rss.unian.net/site/news_ukr.rss' },
        { name: 'ТСН', url: 'https://tsn.ua/rss/full.rss' }
    ];

    const RSS2JSON = 'https://api.rss2json.com/v1/api.json?rss_url=';
    const CACHE_KEY = 'bz_news_cache';
    const CACHE_TTL = 15 * 60 * 1000; // 15 хвилин
    const PER_FEED = 10;              // новин з одного джерела
    const MAX_ITEMS = 30;             // усього в рядку
    const SPEED_PX_PER_SEC = 60;      // швидкість руху рядка

    let ticker = null;
    let track = null;
    let items = null;      // null — ще не завантажували
    let loading = false;

    function isEnabled() {
        try { return localStorage.getItem('bz_news_on') !== '0'; } catch (e) { return true; }
    }

    function safeLink(link) {
        try {
            const url = new URL(link);
            return /^https?:$/.test(url.protocol) ? url.href : '';
        } catch (e) {
            return '';
        }
    }

    async function fetchFeed(feed) {
        const response = await fetch(RSS2JSON + encodeURIComponent(feed.url));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.status !== 'ok') throw new Error(data.message || `статус «${data.status}»`);
        return (data.items || []).slice(0, PER_FEED)
            .map((i) => ({ source: feed.name, title: String(i.title || '').trim(), link: safeLink(i.link) }))
            .filter((i) => i.title);
    }

    async function loadNews() {
        // кеш
        try {
            const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
            if (cached && Array.isArray(cached.items) && cached.items.length && Date.now() - cached.ts < CACHE_TTL) {
                dbg(`Новини із кешу: ${cached.items.length} шт.`);
                return cached.items;
            }
        } catch (e) { /* кеш пошкоджено — ігноруємо */ }

        const results = await Promise.allSettled(NEWS_FEEDS.map(fetchFeed));
        const lists = [];
        results.forEach((res, n) => {
            const name = NEWS_FEEDS[n].name;
            if (res.status === 'fulfilled') {
                dbg(`Джерело «${name}»: ок, ${res.value.length} новин`);
                lists.push(res.value);
            } else {
                dbg(`МАРКЕР: джерело «${name}» не відповіло → ${res.reason && res.reason.message}`);
            }
        });

        // чергуємо джерела, щоб рядок не був з однієї редакції
        const merged = [];
        for (let n = 0; n < PER_FEED; n++) {
            lists.forEach((list) => { if (list[n]) merged.push(list[n]); });
        }
        const result = merged.slice(0, MAX_ITEMS);

        if (result.length) {
            try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items: result })); } catch (e) { /* ігноруємо */ }
        }
        return result;
    }

    function ensureTicker() {
        if (ticker) return;
        ticker = document.createElement('div');
        ticker.className = 'news-ticker';
        ticker.id = 'news-ticker';
        ticker.setAttribute('aria-label', 'Стрічка новин');
        track = document.createElement('div');
        track.className = 'news-track';
        ticker.appendChild(track);
        document.body.appendChild(ticker);
    }

    function makeItem(item) {
        const el = document.createElement(item.link ? 'a' : 'span');
        el.className = 'news-item';
        if (item.link) {
            el.href = item.link;
            el.target = '_blank';
            el.rel = 'noopener noreferrer';
        }
        if (item.source) {
            const src = document.createElement('span');
            src.className = 'news-src';
            src.textContent = item.source;
            el.appendChild(src);
        }
        const title = document.createElement('span');
        title.textContent = item.title;
        el.appendChild(title);
        return el;
    }

    function renderItems() {
        track.replaceChildren();
        const list = items && items.length
            ? items
            : [{ source: '', title: 'Новини тимчасово недоступні', link: '' }];

        // дві копії групи — для безшовного циклу прокрутки (-50%)
        for (let copy = 0; copy < 2; copy++) {
            const group = document.createElement('div');
            group.className = 'news-group';
            if (copy === 1) group.setAttribute('aria-hidden', 'true');
            list.forEach((item) => group.appendChild(makeItem(item)));
            track.appendChild(group);
        }
        const seconds = Math.max(40, track.scrollWidth / 2 / SPEED_PX_PER_SEC);
        track.style.animationDuration = `${seconds}s`;
    }

    async function show() {
        ensureTicker();
        if (items === null && !loading) {
            loading = true;
            dbg('МАРКЕР: стрічку увімкнено → завантажуємо новини');
            try {
                items = await loadNews();
            } catch (error) {
                dbg(`ПОМИЛКА завантаження новин: ${(error && error.message) || error}`);
                items = [];
            }
            loading = false;
            renderItems();
        }
        if (loading) return;
        if (!isEnabled()) return; // користувач вимкнув, поки вантажилось

        document.body.classList.add('news-on');
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (ticker && isEnabled()) {
                ticker.classList.add('is-visible');
                dbg('Стрічку новин розгорнуто (1.2 с)');
            }
        }));
    }

    function hide() {
        if (!ticker) return;
        ticker.classList.remove('is-visible');
        document.body.classList.remove('news-on');
        dbg('Стрічку новин згорнуто (1.2 с)');
    }

    window.addEventListener('bz:news-toggle', (event) => {
        if (event.detail && event.detail.on) show(); else hide();
    });

    if (isEnabled()) {
        show();
    } else {
        dbg('МАРКЕР: стрічка вимкнена користувачем (чекбокс у меню «Атмосфера»)');
    }
})();
