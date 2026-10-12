/*
===================================================================
Версія:       1.0.0 (BanderiZZation! Comments Engine — comments.js)
Дата, час:    2026-10-12 08:30
Розробник:    Афтіпа Марко Оцтович | antiruskontrol@ukr.net
-------------------------------------------------------------------
Еволюція змін:
 Зміни 1.0.0 (Поточна версія):
  1. Підключення Firebase Firestore (проєкт banderizzation--project).
  2. Публічна колекція "comments": замаскована пошта (ma***@gmail.com),
     текст, час. Повна пошта — у закритій колекції "comment_emails"
     (лише запис, читання заборонене правилами).
  3. Живе оновлення списку (onSnapshot), останні 50, нові зверху.
  4. Захист: валідація пошти/довжини, поле-пастка для ботів,
     пауза 30 с між відправками, вивід через textContent (без XSS).
  5. Дебаг-принти в консоль з префіксом [BZ-COMMENTS] та причиною.
===================================================================
*/

import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {
    getFirestore, collection, doc, writeBatch, serverTimestamp,
    query, orderBy, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCJSp79_UdG6j9tLcWotrM5EBKSOjrybYI",
    authDomain: "banderizzation--project.firebaseapp.com",
    projectId: "banderizzation--project",
    storageBucket: "banderizzation--project.firebasestorage.app",
    messagingSenderId: "203896242149",
    appId: "1:203896242149:web:5d6c2de90f631edb84f90c"
};

const TAG = '[BZ-COMMENTS]';
const dbg = (msg, ...rest) => console.log(`${TAG} ${msg}`, ...rest);

const MAX_LEN = 500;
const COOLDOWN_MS = 30000;
const LAST_SENT_KEY = 'bz_comment_last_sent';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
dbg('Firebase ініціалізовано, проєкт:', firebaseConfig.projectId);

const form = document.getElementById('comment-form');
const emailInput = document.getElementById('c-email');
const textInput = document.getElementById('c-text');
const countEl = document.getElementById('c-count');
const honeypot = document.getElementById('c-website');
const submitBtn = document.getElementById('c-submit');
const statusEl = document.getElementById('form-status');
const listEl = document.getElementById('comments-list');

// --- Маскування пошти: ma***@gmail.com ---
function maskEmail(email) {
    const [local, domain] = email.split('@');
    const keep = local.length > 2 ? 2 : 1;
    return `${local.slice(0, keep)}***@${domain}`;
}

function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = 'form-status' + (kind ? ' ' + kind : '');
}

function getLastSent() {
    try { return Number(localStorage.getItem(LAST_SENT_KEY)) || 0; } catch (e) { return 0; }
}
function setLastSent(ts) {
    try { localStorage.setItem(LAST_SENT_KEY, String(ts)); } catch (e) { /* ігноруємо */ }
}

textInput.addEventListener('input', () => { countEl.textContent = textInput.value.length; });

// --- Відправка коментаря ---
form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('', '');

    if (honeypot.value.trim() !== '') {
        dbg('МАРКЕР: заповнено поле-пастку (honeypot) — схоже на бота, запис пропущено');
        setStatus('Коментар надіслано.', 'ok');
        form.reset();
        countEl.textContent = '0';
        return;
    }

    const email = emailInput.value.trim();
    const text = textInput.value.trim();

    if (!EMAIL_RE.test(email) || email.length > 254) {
        dbg('Валідація не пройшла: некоректна пошта →', email);
        setStatus('Вкажіть коректну пошту, наприклад name@gmail.com.', 'err');
        return;
    }
    if (text.length === 0) {
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

    submitBtn.disabled = true;
    setStatus('Надсилаємо…', '');

    try {
        const commentRef = doc(collection(db, 'comments'));
        const emailRef = doc(db, 'comment_emails', commentRef.id);
        const batch = writeBatch(db);
        batch.set(commentRef, {
            maskedEmail: maskEmail(email),
            text: text,
            createdAt: serverTimestamp()
        });
        batch.set(emailRef, {
            email: email,
            createdAt: serverTimestamp()
        });
        await batch.commit();

        setLastSent(Date.now());
        dbg('Збережено коментар, id:', commentRef.id, '| у списку пошта:', maskEmail(email));
        setStatus('Дякуємо! Коментар надіслано.', 'ok');
        form.reset();
        countEl.textContent = '0';
    } catch (error) {
        dbg('ПОМИЛКА збереження:', error.code || '', error.message || error);
        setStatus('Не вдалося зберегти коментар. Спробуйте пізніше.', 'err');
    } finally {
        submitBtn.disabled = false;
    }
});

// --- Список коментарів (живе оновлення) ---
function renderComments(snapshot) {
    listEl.replaceChildren();

    if (snapshot.empty) {
        const empty = document.createElement('p');
        empty.className = 'sub-text';
        empty.textContent = 'Поки що немає коментарів. Будьте першими!';
        listEl.appendChild(empty);
        dbg('Список порожній');
        return;
    }

    snapshot.forEach((docSnap) => {
        const data = docSnap.data({ serverTimestamps: 'estimate' });

        const item = document.createElement('article');
        item.className = 'comment-item';

        const head = document.createElement('div');
        head.className = 'comment-head';

        const who = document.createElement('span');
        who.className = 'comment-email';
        who.textContent = data.maskedEmail || 'анонім';

        const when = document.createElement('span');
        when.className = 'comment-date';
        when.textContent = data.createdAt
            ? data.createdAt.toDate().toLocaleString('uk-UA', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: false
            })
            : '';

        head.append(who, when);

        const body = document.createElement('p');
        body.className = 'comment-text';
        body.textContent = data.text || '';

        item.append(head, body);
        listEl.appendChild(item);
    });

    dbg(`Список оновлено: ${snapshot.size} коментарів`);
}

const q = query(collection(db, 'comments'), orderBy('createdAt', 'desc'), limit(50));
onSnapshot(q, renderComments, (error) => {
    dbg('ПОМИЛКА читання списку:', error.code || '', error.message || error);
    listEl.replaceChildren();
    const err = document.createElement('p');
    err.className = 'sub-text';
    err.textContent = 'Не вдалося завантажити коментарі. Спробуйте оновити сторінку.';
    listEl.appendChild(err);
});
