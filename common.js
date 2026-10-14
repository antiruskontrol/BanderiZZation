/*
===================================================================
Версія:       1.0.0 (BanderiZZation! Hub — common.js)
Дата, час:    2026-10-13 12:00
Розробник:    Афтіпа Марко Оцтович | antiruskontrol@ukr.net
-------------------------------------------------------------------
Еволюція змін:
 Зміни 1.0.0 (Поточна версія):
  1. Верхня панель (час, Київ, «Атмосфера», версія) тепер вставляється
     цим скриптом на ВСІХ сторінках; версія/дата/пошта — в одному місці (SITE).
  2. Годинник реального часу (замінив годинник зі script.js).
  3. Плавні переходи між сторінками: затухання 0.75 с перед переходом
     і проявлення 0.75 с після завантаження.
  4. Вікно версії: клікабельна пошта (mailto); на пристроях без наведення
     вікно відкривається дотиком.
  5. Підключення atmosphere.js та news.js.
  6. Дебаг-принти [BZ-BAR] / [BZ-NAV] з описом маркера спрацювання.
===================================================================
*/

(function () {
    'use strict';

    // ===== ЄДИНЕ ДЖЕРЕЛО ВЕРСІЇ САЙТУ (змінювати тільки тут) =====
    const SITE = {
        version: '1.1.9',
        date: '2026-10-13',
        time: '12:00:00',
        email: 'antiruskontrol@ukr.net'
    };

    const FADE_MS = 750; // Час затухання/проявлення сторінки
    const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const dbgBar = (msg, ...rest) => console.log(`[BZ-BAR] ${msg}`, ...rest);
    const dbgNav = (msg, ...rest) => console.log(`[BZ-NAV] ${msg}`, ...rest);

    // --- 1. ВСТАВКА ВЕРХНЬОЇ ПАНЕЛІ ---
    function buildBar() {
        if (document.querySelector('.top-bar')) {
            dbgBar('МАРКЕР: панель вже є на сторінці — повторну вставку пропущено');
            return;
        }

        const html = `
    <div class="top-bar">
        <span id="current-datetime"></span>
        <span class="location-badge">🇺🇦 Київ</span>
        <div class="top-controls">

            <div class="atmo-zone" id="atmo-zone">
                <span class="control-badge atmo-badge" id="atmo-badge" role="button" tabindex="0" aria-haspopup="true" aria-expanded="false">Атмосфера: вимкнено 🔇</span>
                <div class="atmo-popup" id="atmo-popup">
                    <label class="atmo-row"><span>🔊 Звук</span><input type="checkbox" id="atmo-sound"></label>
                    <div class="atmo-row atmo-col">
                        <span>🎵 Композиція</span>
                        <select id="atmo-track"><option>Завантаження…</option></select>
                    </div>
                    <div class="atmo-row atmo-col">
                        <span>Гучність: <b id="atmo-volume-val">50%</b></span>
                        <input type="range" id="atmo-volume" min="0" max="100" step="1" value="50">
                    </div>
                    <label class="atmo-row"><span>📰 Стрічка новин</span><input type="checkbox" id="atmo-news" checked></label>
                </div>
            </div>

            <div class="version-trigger-zone">
                <span class="version-badge">v${SITE.version} ℹ️</span>
                <div class="neon-version-popup">
                    <div class="neon-line">ВЕРСІЯ: v${SITE.version} STABLE</div>
                    <div class="neon-line">ДАТА: ${SITE.date}</div>
                    <div class="neon-line">ЧАС: ${SITE.time}</div>
                    <a class="neon-line neon-mail" href="mailto:${SITE.email}">РОЗРОБНИК: ${SITE.email}</a>

                    <div class="neon-location-tag">KYIV UKRAINE 2026</div>

                    <div class="logo-sites-grid" style="display: flex; gap: 1.2rem; margin-top: 1rem;">
                        <a href="https://antiruskontrol.github.io/WeatherInUkraine/" target="_blank" rel="noopener" class="logo-site-link-custom" title="WeatherInUkraine">
                            <img src="weather-logo.png" alt="Weather" style="width: 64px; height: 64px; object-fit: contain; border-radius: 6px;">
                        </a>
                        <a href="https://antiruskontrol.github.io/antirus-control/" target="_blank" rel="noopener" class="logo-site-link-custom" title="UAFilter">
                            <img src="antirus-logo.png" alt="UAFilter" style="width: 64px; height: 64px; object-fit: contain; border-radius: 6px;">
                        </a>
                    </div>
                </div>
            </div>

        </div>
    </div>`;

        document.body.insertAdjacentHTML('afterbegin', html);

        if (!document.querySelector('.screen-overlay')) {
            document.body.insertAdjacentHTML('beforeend', '<div class="screen-overlay"></div>');
            dbgBar('МАРКЕР: на сторінці не було маски затемнення — додано .screen-overlay');
        }
        dbgBar(`Панель вставлено, версія сайту v${SITE.version}`);
    }

    // --- 2. ГОДИННИК ---
    function updateClock() {
        const el = document.getElementById('current-datetime');
        if (!el) return;
        const options = {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        };
        el.textContent = new Date().toLocaleString('uk-UA', options).replace(',', '');
    }

    // --- 3. ВІКНО ВЕРСІЇ НА ПРИСТРОЯХ БЕЗ НАВЕДЕННЯ (ДОТИК) ---
    function initVersionTouch() {
        if (!window.matchMedia('(hover: none)').matches) return;
        const zone = document.querySelector('.version-trigger-zone');
        if (!zone) return;

        const setOpen = (open) => {
            zone.classList.toggle('is-open', open);
            document.body.classList.toggle('version-open', open);
        };
        zone.addEventListener('click', (event) => {
            if (event.target.closest('a')) return; // клік по пошті/логотипу — не перемикаємо
            const open = !zone.classList.contains('is-open');
            setOpen(open);
            dbgBar(`МАРКЕР: дотик по бейджу версії → вікно ${open ? 'відкрито' : 'закрито'}`);
        });
        document.addEventListener('click', (event) => {
            if (!zone.contains(event.target) && zone.classList.contains('is-open')) {
                setOpen(false);
                dbgBar('МАРКЕР: дотик повз вікно версії → вікно закрито');
            }
        });
    }

    // --- 4. ПЛАВНІ ПЕРЕХОДИ МІЖ СТОРІНКАМИ ---
    let leaving = false;

    function fadeInPage() {
        const reveal = () => {
            if (document.documentElement.classList.contains('bz-pre')) {
                document.documentElement.classList.remove('bz-pre');
                dbgNav(`Проявлення сторінки (${FADE_MS} мс)`);
            }
        };
        requestAnimationFrame(() => requestAnimationFrame(reveal));
        setTimeout(reveal, 1500); // страховка, якщо анімаційні кадри призупинено
    }

    function initNavigation() {
        document.addEventListener('click', (event) => {
            if (event.defaultPrevented || event.button !== 0) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

            const link = event.target.closest('a[href]');
            if (!link) return;

            const href = link.getAttribute('href');
            const skip = (reason) => dbgNav(`Перехід без затухання (${reason}) →`, href);

            if (link.target && link.target !== '_self') return skip('відкривається в новій вкладці');
            if (link.hasAttribute('download')) return skip('завантаження файлу');

            let url;
            try { url = new URL(link.href, location.href); } catch (e) { return skip('некоректна адреса'); }

            if (!/^https?:$/.test(url.protocol)) return skip('не http(s): mailto/tel тощо');
            if (url.origin !== location.origin) return skip('зовнішнє посилання');
            if (url.pathname === location.pathname && url.search === location.search) return skip('та сама сторінка / якір');
            if (REDUCED) return skip('у системі увімкнено «зменшити рух»');

            event.preventDefault();
            if (leaving) return;
            leaving = true;

            dbgNav(`МАРКЕР: клік по внутрішньому посиланню → затухання ${FADE_MS} мс, потім перехід на ${url.href}`);
            window.dispatchEvent(new CustomEvent('bz:leave', { detail: { ms: FADE_MS } }));
            document.documentElement.classList.add('bz-pre');
            setTimeout(() => { location.href = url.href; }, FADE_MS);
        });

        // Повернення кнопкою «Назад» (сторінка з кешу браузера)
        window.addEventListener('pageshow', (event) => {
            if (event.persisted) {
                leaving = false;
                dbgNav('МАРКЕР: сторінку відновлено з кешу (кнопка «Назад») → проявляємо');
                fadeInPage();
            }
        });
    }

    // --- 5. ПІДКЛЮЧЕННЯ ІНШИХ СКРИПТІВ (ПО ЧЕРЗІ) ---
    function loadScript(src) {
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => { dbgBar(`Підключено ${src}`); resolve(true); };
            script.onerror = () => { dbgBar(`ПОМИЛКА підключення ${src} (файл відсутній у репозиторії?)`); resolve(false); };
            document.body.appendChild(script);
        });
    }

    async function init() {
        buildBar();
        updateClock();
        setInterval(updateClock, 1000);
        initVersionTouch();
        initNavigation();
        fadeInPage();
        await loadScript('atmosphere.js');
        await loadScript('news.js');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
