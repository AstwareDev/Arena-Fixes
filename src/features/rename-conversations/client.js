// ─────────────────────────────────────────────────────────────────────────────
// Conversation Actions — Redesigned with modal rename dialog
// ─────────────────────────────────────────────────────────────────────────────

const RENAME_LS_KEY   = 'af_conv_names';
const PIN_LS_KEY      = 'af_conv_pins';
const RENAME_INJECTED = 'data-af-ca-done';
// RENAME_EDITING removed — no more inline editing state in the sidebar DOM

let renameEnabled  = false;
let renameObserver = null;
let menuObserver   = null;
let _activeModal   = null;   // replaces _editingConvId; null when no modal is open
let _lastActiveLi  = null;

// ── Storage helpers ───────────────────────────────────────────────────────────

function loadNames() {
    try { return JSON.parse(localStorage.getItem(RENAME_LS_KEY) || '{}'); }
    catch { return {}; }
}
function loadPins() {
    try { return JSON.parse(localStorage.getItem(PIN_LS_KEY) || '[]'); }
    catch { return []; }
}

function saveName(convId, name) {
    const map = loadNames();
    if (name) map[convId] = name;
    else delete map[convId];
    localStorage.setItem(RENAME_LS_KEY, JSON.stringify(map));
}

function togglePin(convId) {
    const pins = loadPins();
    const idx  = pins.indexOf(convId);
    if (idx === -1) pins.unshift(convId);
    else pins.splice(idx, 1);
    localStorage.setItem(PIN_LS_KEY, JSON.stringify(pins));
    return idx === -1;
}

function getConvId(anchor) {
    const m = (anchor.getAttribute('href') || '').match(/^\/c\/([a-f0-9-]+)$/i);
    return m ? m[1] : null;
}

// ── Fresh DOM query ───────────────────────────────────────────────────────────
// Always re-query after any async gap; React may have rebuilt the sidebar.

function queryConvElements(convId) {
    const anchor = document.querySelector(`a[href="/c/${convId}"]`);
    if (!anchor) return null;
    const li        = anchor.closest('[data-sidebar="menu-item"]');
    const titleSpan = anchor.querySelector('span.truncate');
    if (!li || !titleSpan) return null;
    return { anchor, li, titleSpan };
}

// ── Styles ────────────────────────────────────────────────────────────────────

function injectStyle() {
    if (document.getElementById(IDS.RENAME_CONV_STYLE)) return;
    const s = document.createElement('style');
    s.id = IDS.RENAME_CONV_STYLE;
    s.textContent = `

        /* ── Context-menu items ────────────────────────────────────────────── */

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
        .af-ca-item svg       { width: 14px; height: 14px; flex-shrink: 0; }
        .af-ca-item.af-ca-pin-active { color: hsl(var(--interactive-cta, 230 80% 62%)); }

        .af-ca-divider {
            height: 1px;
            background: hsl(var(--border-medium, 240 4% 18%));
            margin: 3px 0;
        }

        /* ── Pin decorations ───────────────────────────────────────────────── */

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

        /* ── Named-conversation marker ─────────────────────────────────────── */

        [data-af-conv-named="true"] { font-style: normal !important; }

        /* ── Flash animation ───────────────────────────────────────────────── */

        @keyframes af-ca-flash {
            from { opacity: 0.35; }
            to   { opacity: 1;    }
        }
        .af-ca-flash { animation: af-ca-flash 0.22s ease forwards; }

        /* ── Rename modal overlay ──────────────────────────────────────────── */

        .af-modal-overlay {
            position: fixed;
            inset: 0;
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.55);
            backdrop-filter: blur(3px);
            -webkit-backdrop-filter: blur(3px);
            animation: af-modal-fadein 0.13s ease;
        }

        /* ── Rename modal card ─────────────────────────────────────────────── */

        .af-modal {
            background: hsl(var(--surface-secondary, 240 4% 12%));
            border: 1px solid hsl(var(--border-medium, 240 4% 22%));
            border-radius: 12px;
            padding: 22px 24px 18px;
            width: min(400px, calc(100vw - 40px));
            display: flex;
            flex-direction: column;
            gap: 14px;
            font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
            box-shadow:
                0 0 0 1px rgba(255,255,255,0.04) inset,
                0 20px 60px rgba(0,0,0,0.55),
                0 4px 16px  rgba(0,0,0,0.35);
            animation: af-modal-slidein 0.18s cubic-bezier(0.34, 1.2, 0.64, 1);
        }

        .af-modal-header {
            display: flex;
            align-items: center;
            gap: 9px;
            font-size: 14px;
            font-weight: 600;
            color: hsl(var(--text-primary, 210 20% 96%));
            line-height: 1.3;
        }
        .af-modal-header svg {
            width: 15px;
            height: 15px;
            flex-shrink: 0;
            opacity: 0.7;
        }

        .af-modal-input {
            width: 100%;
            box-sizing: border-box;
            background: hsl(var(--surface-primary, 240 4% 7%));
            border: 1.5px solid hsl(var(--border-medium, 240 4% 22%));
            border-radius: 8px;
            color: hsl(var(--text-primary, 210 20% 96%));
            font-size: 13.5px;
            font-family: inherit;
            padding: 9px 11px;
            outline: none;
            transition: border-color 0.15s, box-shadow 0.15s;
            caret-color: hsl(var(--interactive-cta, 230 80% 62%));
        }
        .af-modal-input:focus {
            border-color: hsl(var(--interactive-cta, 230 80% 62%));
            box-shadow: 0 0 0 3px hsla(230, 80%, 62%, 0.18);
        }
        .af-modal-input::placeholder {
            color: hsl(var(--text-tertiary, 210 10% 42%));
        }

        .af-modal-hint {
            font-size: 11px;
            color: hsl(var(--text-tertiary, 210 10% 38%));
            margin-top: -6px;
            letter-spacing: 0.01em;
        }

        .af-modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 2px;
        }

        .af-modal-btn {
            padding: 7px 16px;
            border-radius: 7px;
            font-size: 13px;
            font-weight: 500;
            font-family: inherit;
            cursor: pointer;
            border: 1.5px solid transparent;
            outline: none;
            line-height: 1.45;
            letter-spacing: 0.01em;
            transition: background 0.1s, border-color 0.1s, opacity 0.1s, box-shadow 0.1s;
        }
        .af-modal-btn:focus-visible {
            box-shadow: 0 0 0 2px hsl(var(--interactive-cta, 230 80% 62%));
        }

        .af-modal-cancel {
            background: transparent;
            border-color: hsl(var(--border-medium, 240 4% 24%));
            color: hsl(var(--text-secondary, 210 10% 68%));
        }
        .af-modal-cancel:hover {
            background: hsl(var(--surface-tertiary, 240 4% 18%));
            color: hsl(var(--text-primary, 210 20% 96%));
        }

        .af-modal-confirm {
            background: hsl(var(--interactive-cta, 230 80% 62%));
            border-color: transparent;
            color: #000;
        }
        .af-modal-confirm:hover  { opacity: 0.86; }
        .af-modal-confirm:active { opacity: 0.72; }

        @keyframes af-modal-fadein {
            from { opacity: 0; }
            to   { opacity: 1; }
        }
        @keyframes af-modal-slidein {
            from { opacity: 0; transform: scale(0.94) translateY(8px); }
            to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
    `;
    document.head.appendChild(s);
}

// ── SVG icons ─────────────────────────────────────────────────────────────────

const SVG_PIN    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg>`;
const SVG_UNPIN  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="22" y2="22"/><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12"/></svg>`;
const SVG_RENAME = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const SVG_PIN_SM = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg>`;

// ── Track which list-item triggered the menu ───────────────────────────────────

function trackActiveLi() {
    document.addEventListener('mousedown', e => {
        const btn = e.target.closest('button[data-sidebar="menu-action"]');
        if (!btn) return;
        const li = btn.closest('[data-sidebar="menu-item"]');
        if (li && !li.getAttribute('data-af-ca-pinned-clone')) {
            _lastActiveLi = li;
        }
    }, true);
}

function resolveActiveLi() {
    const openBtn = document.querySelector(
        'button[data-sidebar="menu-action"][data-state="open"],' +
        'button[data-sidebar="menu-action"][aria-expanded="true"]'
    );
    if (openBtn) {
        const li = openBtn.closest('[data-sidebar="menu-item"]');
        if (li && !li.getAttribute('data-af-ca-pinned-clone')) return li;
    }
    return _lastActiveLi || null;
}

// ── Modal rename dialog ────────────────────────────────────────────────────────
//
// Lives in document.body — completely outside the React/sidebar DOM tree.
// No focus/blur race conditions, no dependency on sidebar re-render timing.

function showRenameModal(convId) {
    if (_activeModal) return;               // one dialog at a time

    // Snapshot current name before any async gap
    const names     = loadNames();
    const els       = queryConvElements(convId);
    const origTitle = els?.titleSpan?.getAttribute('data-af-orig-title')
                   || els?.titleSpan?.textContent?.trim()
                   || '';
    const current   = names[convId] || origTitle;

    // ── Build overlay ──────────────────────────────────────────────────────

    const overlay = document.createElement('div');
    overlay.className = 'af-modal-overlay';
    overlay.setAttribute('role', 'presentation');

    // ── Build dialog card ──────────────────────────────────────────────────

    const dialog = document.createElement('div');
    dialog.className = 'af-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Rename Conversation');

    const header = document.createElement('div');
    header.className = 'af-modal-header';
    header.innerHTML = SVG_RENAME + '<span>Rename Conversation</span>';

    const input = document.createElement('input');
    input.type      = 'text';
    input.className = 'af-modal-input';
    input.value     = current;
    input.maxLength = 120;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    input.placeholder = 'Enter a name for this conversation…';

    const hint = document.createElement('div');
    hint.className   = 'af-modal-hint';
    hint.textContent = 'Enter to save · Esc to cancel';

    const footer = document.createElement('div');
    footer.className = 'af-modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.type      = 'button';
    cancelBtn.className = 'af-modal-btn af-modal-cancel';
    cancelBtn.textContent = 'Cancel';

    const confirmBtn = document.createElement('button');
    confirmBtn.type      = 'button';
    confirmBtn.className = 'af-modal-btn af-modal-confirm';
    confirmBtn.textContent = 'Rename';

    footer.append(cancelBtn, confirmBtn);
    dialog.append(header, input, hint, footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    _activeModal = overlay;

    // Focus + select all text once the overlay is painted
    requestAnimationFrame(() => { input.focus(); input.select(); });

    // ── Action handlers ────────────────────────────────────────────────────

    function closeModal() {
        if (!_activeModal) return;
        overlay.remove();
        _activeModal = null;
    }

    function confirmRename() {
        const newName = input.value.trim() || null;   // null → deletes the override
        saveName(convId, newName);
        closeModal();
        // Re-query after the modal is gone; React may have re-rendered the sidebar
        requestAnimationFrame(() => {
            const freshEls = queryConvElements(convId);
            if (freshEls) {
                const orig = freshEls.titleSpan.getAttribute('data-af-orig-title') || origTitle;
                applyToSpan(freshEls.titleSpan, newName, orig);
            }
            rebuildPinnedSection();
        });
    }

    function cancelRename() {
        closeModal();
    }

    // ── Wire events ────────────────────────────────────────────────────────

    confirmBtn.addEventListener('click', confirmRename);
    cancelBtn.addEventListener('click', cancelRename);

    // Click directly on the dark overlay (outside the card) → cancel
    overlay.addEventListener('mousedown', e => {
        if (e.target === overlay) cancelRename();
    });

    // Keyboard: Enter/Esc on the input
    input.addEventListener('keydown', e => {
        e.stopPropagation();                        // don't leak to ChatGPT shortcuts
        if (e.key === 'Enter')  { e.preventDefault(); confirmRename(); }
        if (e.key === 'Escape') { e.preventDefault(); cancelRename();  }
    });

    // Focus trap: Tab cycles between input → Cancel → Rename → input
    dialog.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); cancelRename(); return; }
        if (e.key !== 'Tab') return;

        const focusable = [input, cancelBtn, confirmBtn];
        const first     = focusable[0];
        const last      = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault(); first.focus();
        }
    });
}

// ── Radix menu injection ───────────────────────────────────────────────────────

function makeMenuItem(icon, label, onMouseDown, extraClass = '') {
    const el = document.createElement('div');
    el.setAttribute('role', 'menuitem');
    el.setAttribute('tabindex', '-1');
    el.setAttribute('data-orientation', 'vertical');
    el.setAttribute('data-radix-collection-item', '');
    el.className = 'af-ca-item' + (extraClass ? ' ' + extraClass : '');
    el.innerHTML = icon + `<span>${label}</span>`;
    el.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        onMouseDown();
    });
    return el;
}

function injectIntoRadixMenu(menuEl) {
    if (menuEl.hasAttribute('data-af-ca-injected')) return;

    const li = resolveActiveLi();
    if (!li) return;

    const anchor = li.querySelector('a[href^="/c/"]');
    if (!anchor) return;
    const convId = getConvId(anchor);
    if (!convId) return;

    const archiveItem = [...menuEl.querySelectorAll('[role="menuitem"]')]
        .find(el => el.textContent.trim() === 'Archive');
    if (!archiveItem) return;

    menuEl.setAttribute('data-af-ca-injected', '1');

    const isPinned = loadPins().includes(convId);

    const pinItem = makeMenuItem(
        isPinned ? SVG_UNPIN : SVG_PIN,
        isPinned ? 'Unpin' : 'Pin',
        () => {
            const els      = queryConvElements(convId);
            const targetLi = els ? els.li : li;
            const nowPinned = togglePin(convId);
            syncPinDot(targetLi, convId, nowPinned);
            rebuildPinnedSection();
        },
        isPinned ? 'af-ca-pin-active' : ''
    );

    // ── Rename item: one rAF lets the Radix menu begin closing before the
    //    modal mounts. The modal overlay then covers any residual animation.
    const renameItem = makeMenuItem(SVG_RENAME, 'Rename', () => {
        requestAnimationFrame(() => showRenameModal(convId));
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

// ── Pin dot ───────────────────────────────────────────────────────────────────

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

// ── Pinned section ────────────────────────────────────────────────────────────

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

// ── Span helpers ──────────────────────────────────────────────────────────────

function applyToSpan(titleSpan, customName, orig) {
    titleSpan.innerHTML   = '';
    titleSpan.textContent = customName || orig || '';
    titleSpan.style.fontStyle = '';

    if (customName) {
        titleSpan.setAttribute('data-af-conv-named', 'true');
        titleSpan.classList.add('af-ca-flash');
        titleSpan.addEventListener(
            'animationend',
            () => titleSpan.classList.remove('af-ca-flash'),
            { once: true }
        );
    } else {
        titleSpan.removeAttribute('data-af-conv-named');
    }
}

// ── Sidebar item processing ───────────────────────────────────────────────────

function processItem(li) {
    if (li.getAttribute('data-af-ca-pinned-clone')) return;

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
    if (names[convId]) {
        applyToSpan(titleSpan, names[convId], titleSpan.getAttribute('data-af-orig-title'));
    }

    syncPinDot(li, convId, loadPins().includes(convId));
}

function processAll() {
    document.querySelectorAll('[data-sidebar="menu-item"]').forEach(li => processItem(li));
}

// No more inline editing state to guard against — just skip spans with a live
// <input> child (should never happen with the modal approach, but defensive).
function reapplyNames() {
    const names = loadNames();
    document.querySelectorAll(`a[href^="/c/"][${RENAME_INJECTED}]`).forEach(anchor => {
        const convId = getConvId(anchor);
        if (!convId || !names[convId]) return;

        const ts = anchor.querySelector('span.truncate');
        if (!ts || ts.querySelector('input')) return;

        if (ts.textContent.trim() !== names[convId]) {
            applyToSpan(ts, names[convId], ts.getAttribute('data-af-orig-title'));
        }
    });
}

// ── Enable / disable ──────────────────────────────────────────────────────────

function enableRenameConversations() {
    injectStyle();
    trackActiveLi();
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
    // Close any open modal cleanly before tearing down
    if (_activeModal) { _activeModal.remove(); _activeModal = null; }

    stopMenuObserver();
    if (renameObserver) { renameObserver.disconnect(); renameObserver = null; }

    document.querySelectorAll('.af-ca-pin-dot').forEach(el => el.remove());
    document.querySelectorAll('[data-af-ca-pinned-section]').forEach(el => el.remove());

    document.querySelectorAll(`a[href^="/c/"][${RENAME_INJECTED}]`).forEach(anchor => {
        anchor.removeAttribute(RENAME_INJECTED);
        const ts = anchor.querySelector('span.truncate');
        if (ts) {
            const orig = ts.getAttribute('data-af-orig-title');
            if (orig) applyToSpan(ts, null, orig);
        }
    });

    _lastActiveLi = null;
    document.getElementById(IDS.RENAME_CONV_STYLE)?.remove();
}

// ── Init ──────────────────────────────────────────────────────────────────────

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