const RENAME_LS_KEY   = 'af_conv_names';
const PIN_LS_KEY      = 'af_conv_pins';
const RENAME_INJECTED = 'data-af-ca-done';
const RENAME_EDITING  = 'data-af-ca-editing';

let renameEnabled  = false;
let renameObserver = null;
let menuObserver   = null;
let _editingConvId = null;

function loadNames() { try { return JSON.parse(localStorage.getItem(RENAME_LS_KEY) || '{}'); } catch { return {}; } }
function loadPins()  { try { return JSON.parse(localStorage.getItem(PIN_LS_KEY)    || '[]'); } catch { return []; } }

function saveName(convId, name) {
    const map = loadNames();
    if (name) map[convId] = name; else delete map[convId];
    localStorage.setItem(RENAME_LS_KEY, JSON.stringify(map));
}

function togglePin(convId) {
    const pins = loadPins();
    const idx  = pins.indexOf(convId);
    if (idx === -1) pins.unshift(convId); else pins.splice(idx, 1);
    localStorage.setItem(PIN_LS_KEY, JSON.stringify(pins));
    return idx === -1;
}

function getConvId(anchor) {
    const m = (anchor.getAttribute('href') || '').match(/^\/c\/([a-f0-9-]+)$/i);
    return m ? m[1] : null;
}

function injectStyle() {
    if (document.getElementById(IDS.RENAME_CONV_STYLE)) return;
    const s = document.createElement('style');
    s.id = IDS.RENAME_CONV_STYLE;
    s.textContent = `
        .af-ca-item {
            position: relative;
            display: flex;
            cursor: pointer;
            user-select: none;
            align-items: center;
            gap: 8px;
            border-radius: 4px;
            padding: 6px 8px;
            font-size: 12px;
            outline: none;
            width: 100%;
            background: transparent;
            border: none;
            color: inherit;
            font-family: inherit;
            text-align: left;
            white-space: nowrap;
            box-sizing: border-box;
            transition: background 0.08s;
        }
        .af-ca-item:hover,
        .af-ca-item:focus {
            background: hsl(var(--surface-tertiary, 240 4% 16%));
            outline: none;
        }
        .af-ca-item svg { width: 14px; height: 14px; flex-shrink: 0; }
        .af-ca-item.af-ca-pin-active { color: hsl(var(--interactive-cta, 230 80% 62%)); }

        .af-ca-divider {
            height: 1px;
            background: hsl(var(--border-medium, 240 4% 18%));
            margin: 3px 0;
        }

        .af-ca-pin-dot {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 12px;
            height: 12px;
            flex-shrink: 0;
            color: hsl(var(--interactive-cta, 230 80% 62%));
            opacity: 0.65;
        }
        .af-ca-pin-dot svg { width: 10px; height: 10px; }

        .af-ca-pinned-header {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.07em;
            text-transform: uppercase;
            color: hsl(var(--text-tertiary, 210 10% 38%));
            padding: 8px 10px 4px;
            font-family: 'Inter', sans-serif;
        }
        .af-ca-pinned-header svg { width: 10px; height: 10px; opacity: 0.55; }
        .af-ca-pinned-divider {
            height: 1px;
            background: rgba(255,255,255,0.05);
            margin: 6px 10px 8px;
        }

        .af-ren-input {
            flex: 1;
            min-width: 0;
            background: transparent;
            border: none;
            border-bottom: 1.5px solid hsl(var(--interactive-cta, 230 80% 62%));
            outline: none;
            color: inherit;
            font-size: 0.875rem;
            font-family: inherit;
            padding: 0 2px;
            line-height: 1.4;
            caret-color: hsl(var(--interactive-cta, 230 80% 62%));
            width: 100%;
        }

        [data-af-ca-editing="true"] [data-sidebar="menu-action"] { display: none !important; }
        [data-af-conv-named="true"] { font-style: normal !important; }

        @keyframes af-ca-flash {
            from { opacity: 0.35; } to { opacity: 1; }
        }
        .af-ca-flash { animation: af-ca-flash 0.22s ease forwards; }
    `;
    document.head.appendChild(s);
}

const SVG_PIN    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg>`;
const SVG_UNPIN  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="22" y2="22"/><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12"/></svg>`;
const SVG_RENAME = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const SVG_PIN_SM = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg>`;

const menuCtx = { convId: null, li: null, anchor: null, titleSpan: null };

function trackNativeButton() {
    document.addEventListener('click', e => {
        const btn = e.target.closest('button[data-sidebar="menu-action"]');
        if (!btn) return;
        const li = btn.closest('[data-sidebar="menu-item"]');
        if (!li || li.getAttribute('data-af-ca-pinned-clone')) return;
        const anchor = li.querySelector('a[href^="/c/"]');
        if (!anchor) return;
        menuCtx.convId    = getConvId(anchor);
        menuCtx.li        = li;
        menuCtx.anchor    = anchor;
        menuCtx.titleSpan = anchor.querySelector('span.truncate');
    }, true);
}

function injectIntoRadixMenu(menuEl) {
    if (menuEl.hasAttribute('data-af-ca-injected')) return;
    if (!menuCtx.convId) return;

    const archiveItem = [...menuEl.querySelectorAll('[role="menuitem"]')]
        .find(el => el.textContent.trim() === 'Archive');
    if (!archiveItem) return;

    menuEl.setAttribute('data-af-ca-injected', '1');

    const { convId, li, anchor, titleSpan } = menuCtx;
    const isPinned = loadPins().includes(convId);

    function makeItem(icon, label, onClick, extraClass = '') {
        const el = document.createElement('div');
        el.setAttribute('role', 'menuitem');
        el.setAttribute('tabindex', '-1');
        el.setAttribute('data-orientation', 'vertical');
        el.setAttribute('data-radix-collection-item', '');
        el.className = 'af-ca-item' + (extraClass ? ' ' + extraClass : '');
        el.innerHTML = icon + `<span>${label}</span>`;
        el.addEventListener('click', () => {
            setTimeout(() => onClick(), 150);
        });
        return el;
    }

    const pinItem = makeItem(
        isPinned ? SVG_UNPIN : SVG_PIN,
        isPinned ? 'Unpin' : 'Pin',
        () => {
            const nowPinned = togglePin(convId);
            syncPinDot(li, convId, nowPinned);
            rebuildPinnedSection();
        },
        isPinned ? 'af-ca-pin-active' : ''
    );

    const renameItem = makeItem(SVG_RENAME, 'Rename', () => {
        startEditing(anchor, convId, titleSpan, li);
    });

    const divider = document.createElement('div');
    divider.className = 'af-ca-divider';
    divider.setAttribute('role', 'separator');

    menuEl.insertBefore(divider,    archiveItem);
    menuEl.insertBefore(renameItem, divider);
    menuEl.insertBefore(pinItem,    renameItem);
}

function startMenuObserver() {
    if (menuObserver) return;
    menuObserver = new MutationObserver(mutations => {
        for (const mut of mutations) {
            for (const node of mut.addedNodes) {
                if (node.nodeType !== 1) continue;
                const menu = node.querySelector?.('[data-radix-menu-content]')
                    ?? (node.matches?.('[data-radix-menu-content]') ? node : null);
                if (menu) injectIntoRadixMenu(menu);
            }
        }
    });
    menuObserver.observe(document.body, { childList: true });
}

function stopMenuObserver() {
    if (menuObserver) { menuObserver.disconnect(); menuObserver = null; }
}

function syncPinDot(li, convId, isPinned) {
    const anchor = li?.querySelector('a[href^="/c/"]');
    if (!anchor) return;
    let dot = anchor.querySelector('.af-ca-pin-dot');
    if (isPinned && !dot) {
        dot = document.createElement('span');
        dot.className = 'af-ca-pin-dot';
        dot.innerHTML = SVG_PIN_SM;
        const iconDiv = anchor.querySelector('div');
        if (iconDiv) iconDiv.after(dot);
        else anchor.insertBefore(dot, anchor.firstChild);
    } else if (!isPinned && dot) {
        dot.remove();
    }
}

function rebuildPinnedSection() {
    document.querySelectorAll('[data-af-ca-pinned-section]').forEach(el => el.remove());

    const pins = loadPins();
    if (!pins.length) return;

    const sidebarContent = document.querySelector('[data-sidebar="content"]');
    if (!sidebarContent) return;

    const section = document.createElement('div');
    section.setAttribute('data-af-ca-pinned-section', '1');

    const header = document.createElement('div');
    header.className = 'af-ca-pinned-header';
    header.innerHTML = SVG_PIN + `<span>Pinned</span>`;
    section.appendChild(header);

    const ul = document.createElement('ul');
    ul.setAttribute('data-sidebar', 'menu');
    ul.className = 'flex w-full min-w-0 flex-col gap-1';

    let added = 0;
    pins.forEach(convId => {
        const origAnchor = sidebarContent.querySelector(
            `a[href="/c/${convId}"][${RENAME_INJECTED}]`
        );
        if (!origAnchor) return;
        const origLi = origAnchor.closest('[data-sidebar="menu-item"]');
        if (!origLi) return;

        const clone = origLi.cloneNode(true);
        clone.setAttribute('data-af-ca-pinned-clone', '1');
        clone.removeAttribute('style');
        clone.style.position = 'relative';

        const cloneAnchor = clone.querySelector('a[href^="/c/"]');
        if (cloneAnchor) {
            cloneAnchor.addEventListener('click', e => {
                e.preventDefault();
                origAnchor.click();
            });
        }

        clone.querySelectorAll('[data-sidebar="menu-action"]').forEach(b => b.remove());
        ul.appendChild(clone);
        added++;
    });

    if (!added) return;

    section.appendChild(ul);
    const divider = document.createElement('div');
    divider.className = 'af-ca-pinned-divider';
    section.appendChild(divider);
    sidebarContent.insertBefore(section, sidebarContent.firstChild);
}

function startEditing(anchor, convId, titleSpan, li) {
    if (!anchor) return;
    if (_editingConvId) return;
    if (anchor.hasAttribute(RENAME_EDITING)) return;

    _editingConvId = convId;
    anchor.setAttribute(RENAME_EDITING, 'true');

    if (!titleSpan.getAttribute('data-af-orig-title')) {
        titleSpan.setAttribute('data-af-orig-title', titleSpan.textContent.trim());
    }

    const names     = loadNames();
    const origTitle = titleSpan.getAttribute('data-af-orig-title') || '';
    const current   = names[convId] || origTitle;

    const input = document.createElement('input');
    input.type      = 'text';
    input.className = 'af-ren-input';
    input.value     = current;
    input.maxLength = 120;
    input.setAttribute('data-af-rename-input', '1');

    titleSpan.innerHTML = '';
    titleSpan.appendChild(input);

    let confirmed  = false;
    let blurEnabled = false;

    const confirmEdit = () => {
        if (confirmed) return;
        confirmed = true;
        finish(anchor, convId, titleSpan, li, input.value.trim() || null);
    };

    const cancelEdit = () => {
        if (confirmed) return;
        confirmed = true;
        finish(anchor, convId, titleSpan, li, undefined);
    };

    input.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter')  { e.preventDefault(); confirmEdit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
    });

    input.addEventListener('blur', () => {
        if (!blurEnabled) return;
        setTimeout(() => {
            if (!input.isConnected) return;
            if (!anchor.hasAttribute(RENAME_EDITING)) return;
            confirmEdit();
        }, 80);
    });

    setTimeout(() => {
        if (!anchor.hasAttribute(RENAME_EDITING)) return;
        input.focus();
        input.select();
        setTimeout(() => {
            blurEnabled = true;
        }, 150);
    }, 300);
}

function finish(anchor, convId, titleSpan, li, newName) {
    anchor.removeAttribute(RENAME_EDITING);
    _editingConvId = null;

    const orig = titleSpan.getAttribute('data-af-orig-title') || '';

    if (newName === undefined) {
        const stored = loadNames()[convId] || null;
        applyToSpan(titleSpan, stored, orig);
    } else {
        saveName(convId, newName);
        applyToSpan(titleSpan, newName, orig);
    }

    rebuildPinnedSection();
}

function applyToSpan(titleSpan, customName, orig) {
    titleSpan.innerHTML   = '';
    titleSpan.textContent = customName || orig || '';
    titleSpan.style.fontStyle = '';

    if (customName) {
        titleSpan.setAttribute('data-af-conv-named', 'true');
        titleSpan.classList.add('af-ca-flash');
        titleSpan.addEventListener('animationend',
            () => titleSpan.classList.remove('af-ca-flash'), { once: true });
    } else {
        titleSpan.removeAttribute('data-af-conv-named');
    }
}

function processItem(li) {
    if (li.getAttribute('data-af-ca-pinned-clone')) return;
    if (li.querySelector('input[data-af-rename-input]')) return;

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

    syncPinDot(li, convId, loadPins().includes(convId));
}

function processAll() {
    document.querySelectorAll('[data-sidebar="menu-item"]').forEach(li => {
        if (li.querySelector('input[data-af-rename-input]')) return;
        processItem(li);
    });
}

function reapplyNames() {
    if (_editingConvId) return;

    const names = loadNames();
    document.querySelectorAll(`a[href^="/c/"][${RENAME_INJECTED}]`).forEach(anchor => {
        if (anchor.hasAttribute(RENAME_EDITING)) return;

        const convId = getConvId(anchor);
        if (!convId || !names[convId]) return;

        const ts = anchor.querySelector('span.truncate');
        if (!ts) return;
        if (ts.querySelector('input[data-af-rename-input]')) return;

        if (ts.textContent.trim() !== names[convId]) {
            applyToSpan(ts, names[convId], ts.getAttribute('data-af-orig-title'));
        }
    });
}

function enableRenameConversations() {
    injectStyle();
    trackNativeButton();
    startMenuObserver();
    processAll();
    rebuildPinnedSection();

    if (!renameObserver) {
        let deb = null;
        renameObserver = new MutationObserver(() => {
            if (deb) return;
            deb = setTimeout(() => {
                deb = null;
                processAll();
                reapplyNames();
                if (!document.querySelector('[data-af-ca-pinned-section]') && loadPins().length) {
                    rebuildPinnedSection();
                }
            }, 120);
        });
        renameObserver.observe(document.body, { childList: true, subtree: true });
    }
}

function disableRenameConversations() {
    stopMenuObserver();
    if (renameObserver) { renameObserver.disconnect(); renameObserver = null; }

    document.querySelectorAll('.af-ca-pin-dot').forEach(el => el.remove());
    document.querySelectorAll('[data-af-ca-pinned-section]').forEach(el => el.remove());

    document.querySelectorAll(`a[href^="/c/"][${RENAME_INJECTED}]`).forEach(anchor => {
        anchor.removeAttribute(RENAME_INJECTED);
        anchor.removeAttribute(RENAME_EDITING);
        const ts = anchor.querySelector('span.truncate');
        if (ts) {
            const orig = ts.getAttribute('data-af-orig-title');
            if (orig) applyToSpan(ts, null, orig);
        }
    });

    _editingConvId = null;
    document.getElementById(IDS.RENAME_CONV_STYLE)?.remove();
}

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