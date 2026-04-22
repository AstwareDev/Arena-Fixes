// Content-script side for Rename Conversations.
// constants.js is loaded first and exposes STORAGE_KEYS, MSG, IDS, ATTR as globals.
// Custom names stored in localStorage keyed by conversation ID from href="/c/{id}".

const RENAME_LS_KEY   = 'af_conv_names';
const RENAME_INJECTED = 'data-af-rename-done';
const RENAME_EDITING  = 'data-af-rename-editing';

let renameEnabled  = false;
let renameObserver = null;

// ── localStorage helpers ───────────────────────────────────────────────────────
function loadNames() {
    try { return JSON.parse(localStorage.getItem(RENAME_LS_KEY) || '{}'); }
    catch { return {}; }
}
function saveName(convId, name) {
    const map = loadNames();
    if (name) map[convId] = name; else delete map[convId];
    localStorage.setItem(RENAME_LS_KEY, JSON.stringify(map));
}
function getConvId(anchor) {
    const m = (anchor.getAttribute('href') || '').match(/^\/c\/([a-f0-9-]+)$/i);
    return m ? m[1] : null;
}

// ── Styles ─────────────────────────────────────────────────────────────────────
function injectRenameStyle() {
    if (document.getElementById(IDS.RENAME_CONV_STYLE)) return;
    const s = document.createElement('style');
    s.id = IDS.RENAME_CONV_STYLE;
    s.textContent = `
        .af-ren-btn {
            display: inline-flex; align-items: center; justify-content: center;
            width: 20px; height: 20px; border: none; background: transparent;
            cursor: pointer; padding: 0; flex-shrink: 0;
            color: hsl(var(--text-secondary, 210 10% 55%));
            opacity: 0; border-radius: 4px;
            transition: opacity 0.12s ease, color 0.12s ease, transform 0.15s ease;
            position: absolute; right: 28px; top: 50%; transform: translateY(-50%); z-index: 10;
        }
        [data-sidebar="menu-item"]:hover .af-ren-btn,
        [data-sidebar="menu-item"]:focus-within .af-ren-btn { opacity: 1; }
        .af-ren-btn.af-ren-named {
            opacity: 0.5;
            color: hsl(var(--interactive-cta, 230 80% 62%));
        }
        [data-sidebar="menu-item"]:hover .af-ren-btn.af-ren-named { opacity: 1; }
        .af-ren-btn:hover {
            color: hsl(var(--interactive-cta, 230 80% 62%));
            transform: translateY(-50%) scale(1.18);
        }
        .af-ren-btn svg { width: 11px; height: 11px; pointer-events: none; }

        .af-ren-input {
            flex: 1; min-width: 0; background: transparent; border: none;
            border-bottom: 1.5px solid hsl(var(--interactive-cta, 230 80% 62%));
            outline: none; color: inherit; font-size: 0.875rem; font-family: inherit;
            padding: 0 2px; line-height: 1.4;
            caret-color: hsl(var(--interactive-cta, 230 80% 62%));
            width: 100%;
        }

        .af-ren-actions {
            display: flex; gap: 2px; flex-shrink: 0; align-items: center;
            position: absolute; right: 4px; top: 50%; transform: translateY(-50%); z-index: 11;
        }
        .af-ren-ok, .af-ren-x {
            display: inline-flex; align-items: center; justify-content: center;
            width: 18px; height: 18px; border: none; border-radius: 3px;
            cursor: pointer; padding: 0; transition: background 0.1s ease;
        }
        .af-ren-ok { background: hsla(142,70%,45%,0.15); color: hsl(142,60%,45%); }
        .af-ren-ok:hover { background: hsla(142,70%,45%,0.30); }
        .af-ren-x  { background: hsla(0,70%,55%,0.12);  color: hsl(0,60%,55%); }
        .af-ren-x:hover  { background: hsla(0,70%,55%,0.25); }
        .af-ren-ok svg, .af-ren-x svg { width: 10px; height: 10px; pointer-events: none; }

        [data-af-conv-named="true"] { font-style: italic; }

        @keyframes af-ren-flash {
            from { opacity: 0.35; } to { opacity: 1; }
        }
        .af-ren-flash { animation: af-ren-flash 0.22s ease forwards; }

        [data-af-rename-editing="true"] [data-sidebar="menu-action"] { display: none !important; }
        [data-af-rename-editing="true"] { pointer-events: none; }
        [data-af-rename-editing="true"] .af-ren-input,
        [data-af-rename-editing="true"] .af-ren-actions { pointer-events: all; }
    `;
    document.head.appendChild(s);
}

// ── SVG icons ──────────────────────────────────────────────────────────────────
const SVG_PENCIL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const SVG_CHECK  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const SVG_X      = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

// ── Editing ────────────────────────────────────────────────────────────────────
function startEditing(anchor, convId, titleSpan) {
    if (anchor.hasAttribute(RENAME_EDITING)) return;
    anchor.setAttribute(RENAME_EDITING, 'true');

    if (!titleSpan.getAttribute('data-af-orig-title')) {
        titleSpan.setAttribute('data-af-orig-title', titleSpan.textContent.trim());
    }

    const names   = loadNames();
    const current = names[convId] || titleSpan.getAttribute('data-af-orig-title') || '';

    const input = document.createElement('input');
    input.type = 'text'; input.className = 'af-ren-input';
    input.value = current; input.maxLength = 120;

    const actions = document.createElement('div');
    actions.className = 'af-ren-actions';
    const ok = document.createElement('button');
    ok.type = 'button'; ok.className = 'af-ren-ok'; ok.innerHTML = SVG_CHECK; ok.setAttribute('aria-label', 'Confirm rename');
    const cx = document.createElement('button');
    cx.type = 'button'; cx.className = 'af-ren-x'; cx.innerHTML = SVG_X; cx.setAttribute('aria-label', 'Cancel rename');
    actions.appendChild(ok); actions.appendChild(cx);

    titleSpan.innerHTML = '';
    titleSpan.appendChild(input);

    const li = anchor.closest('[data-sidebar="menu-item"]');
    if (li) { li.style.position = 'relative'; li.appendChild(actions); }

    requestAnimationFrame(() => { input.focus(); input.select(); });

    const confirm = () => finish(anchor, convId, titleSpan, li, input.value.trim() || null);
    const cancel  = () => finish(anchor, convId, titleSpan, li, undefined);

    ok.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); confirm(); });
    cx.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); cancel(); });
    input.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter')  { e.preventDefault(); confirm(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', () => {
        setTimeout(() => { if (anchor.hasAttribute(RENAME_EDITING)) confirm(); }, 160);
    });
}

function finish(anchor, convId, titleSpan, li, newName) {
    anchor.removeAttribute(RENAME_EDITING);
    li?.querySelector('.af-ren-actions')?.remove();

    const orig = titleSpan.getAttribute('data-af-orig-title') || '';
    if (newName === undefined) {
        applyToSpan(titleSpan, null, orig);
    } else {
        saveName(convId, newName);
        applyToSpan(titleSpan, newName, orig);
    }
    const btn = li?.querySelector('.af-ren-btn');
    if (btn) syncBtn(btn, convId);
}

function applyToSpan(titleSpan, customName, orig) {
    titleSpan.innerHTML = '';
    titleSpan.textContent = customName || orig || '';
    if (customName) {
        titleSpan.setAttribute('data-af-conv-named', 'true');
        titleSpan.classList.add('af-ren-flash');
        titleSpan.addEventListener('animationend', () => titleSpan.classList.remove('af-ren-flash'), { once: true });
    } else {
        titleSpan.removeAttribute('data-af-conv-named');
    }
}

function syncBtn(btn, convId) {
    const named = !!loadNames()[convId];
    btn.classList.toggle('af-ren-named', named);
    btn.title = named ? 'Edit custom name' : 'Rename conversation';
}

// ── Process one sidebar item ───────────────────────────────────────────────────
function processItem(li) {
    const anchor = li.querySelector('a[href^="/c/"]');
    if (!anchor || anchor.hasAttribute(RENAME_INJECTED)) return;
    anchor.setAttribute(RENAME_INJECTED, 'true');

    const convId = getConvId(anchor);
    if (!convId) return;

    const titleSpan = anchor.querySelector('span.truncate');
    if (!titleSpan) return;

    if (!titleSpan.getAttribute('data-af-orig-title')) {
        titleSpan.setAttribute('data-af-orig-title', titleSpan.textContent.trim());
    }

    const names = loadNames();
    if (names[convId]) applyToSpan(titleSpan, names[convId], titleSpan.getAttribute('data-af-orig-title'));

    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'af-ren-btn'; btn.innerHTML = SVG_PENCIL;
    syncBtn(btn, convId);
    btn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        startEditing(anchor, convId, titleSpan);
    });

    li.style.position = 'relative';
    li.appendChild(btn);

    titleSpan.addEventListener('dblclick', e => {
        e.preventDefault(); e.stopPropagation();
        if (!anchor.hasAttribute(RENAME_EDITING)) startEditing(anchor, convId, titleSpan);
    });
}

function processAll() {
    document.querySelectorAll('[data-sidebar="menu-item"]').forEach(processItem);
}

function reapplyNames() {
    const names = loadNames();
    document.querySelectorAll('a[href^="/c/"][data-af-orig-title]').forEach(anchor => {
        const convId = getConvId(anchor);
        if (!convId || !names[convId]) return;
        const titleSpan = anchor.querySelector('span.truncate');
        if (!titleSpan) return;
        if (titleSpan.textContent.trim() !== names[convId]) {
            applyToSpan(titleSpan, names[convId], titleSpan.getAttribute('data-af-orig-title'));
        }
    });
}

// ── Enable / disable ───────────────────────────────────────────────────────────
function enableRenameConversations() {
    injectRenameStyle();
    processAll();

    if (!renameObserver) {
        let deb = null;
        renameObserver = new MutationObserver(() => {
            if (deb) return;
            deb = setTimeout(() => { deb = null; processAll(); reapplyNames(); }, 100);
        });
        renameObserver.observe(document.body, { childList: true, subtree: true });
    }
}

function disableRenameConversations() {
    if (renameObserver) { renameObserver.disconnect(); renameObserver = null; }
    document.querySelectorAll('.af-ren-btn, .af-ren-actions').forEach(el => el.remove());
    document.querySelectorAll('a[href^="/c/"][data-af-orig-title]').forEach(anchor => {
        anchor.removeAttribute(RENAME_INJECTED);
        anchor.removeAttribute(RENAME_EDITING);
        const titleSpan = anchor.querySelector('span.truncate');
        if (!titleSpan) return;
        const orig = titleSpan.getAttribute('data-af-orig-title');
        if (orig) applyToSpan(titleSpan, null, orig);
    });
    document.getElementById(IDS.RENAME_CONV_STYLE)?.remove();
}

// ── Init ───────────────────────────────────────────────────────────────────────
chrome.storage.local.get([STORAGE_KEYS.RENAME_CONV_ENABLED], data => {
    renameEnabled = !!data[STORAGE_KEYS.RENAME_CONV_ENABLED];
    if (renameEnabled) enableRenameConversations();
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (STORAGE_KEYS.RENAME_CONV_ENABLED in changes) {
        renameEnabled = !!changes[STORAGE_KEYS.RENAME_CONV_ENABLED].newValue;
        renameEnabled ? enableRenameConversations() : disableRenameConversations();
    }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== MSG.REFRESH_RENAME_CONV) return;
    chrome.storage.local.get([STORAGE_KEYS.RENAME_CONV_ENABLED], data => {
        renameEnabled = !!data[STORAGE_KEYS.RENAME_CONV_ENABLED];
        renameEnabled ? enableRenameConversations() : disableRenameConversations();
    });
    sendResponse({ ok: true });
    return true;
});