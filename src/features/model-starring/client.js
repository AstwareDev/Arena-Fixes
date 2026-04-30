// Content-script side for Model Starring.
// constants.js is loaded first by the manifest and exposes STORAGE_KEYS, MSG, IDS, ATTR as globals.
// PERF FIX: rebuildStarredSection (which clones DOM nodes) is now guarded so it
// only runs when the model picker (cmdk) is actually open. Previously it ran on
// every DOM mutation including during chat streaming, causing significant jank.

let starringEnabled  = false;
let starredModels    = new Set();
let starringObserver = null;
let lastKnownItems   = new Map(); // modelValue → item element

// ── Styles ─────────────────────────────────────────────────────────────────────
function injectStarringStyle() {
    if (document.getElementById(IDS.MODEL_STARRING)) return;
    const style = document.createElement('style');
    style.id = IDS.MODEL_STARRING;
    style.textContent = `
        /* ── Star button ── */
        .af-star-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
            border: none;
            background: transparent;
            cursor: pointer;
            padding: 0;
            flex-shrink: 0;
            color: hsl(var(--text-muted, 240 5% 40%));
            opacity: 0;
            transition: opacity 0.15s ease, color 0.15s ease, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
            border-radius: 4px;
            position: relative;
            z-index: 2;
        }
        [cmdk-item]:hover .af-star-btn,
        [cmdk-item][data-selected="true"] .af-star-btn { opacity: 1; }
        .af-star-btn.af-starred {
            opacity: 1;
            color: #f59e0b;
        }
        .af-star-btn:hover {
            color: #f59e0b;
            transform: scale(1.2) rotate(-5deg);
        }
        .af-star-btn.af-starred:hover {
            transform: scale(1.15) rotate(5deg);
        }
        .af-star-btn svg {
            width: 16px;
            height: 16px;
            pointer-events: none;
            transition: filter 0.15s ease;
        }
        .af-star-btn.af-starred svg {
            filter: drop-shadow(0 0 3px rgba(245, 158, 11, 0.5));
        }

        /* ── Star burst animation ── */
        @keyframes af-star-pop {
            0%   { transform: scale(1); }
            40%  { transform: scale(1.45) rotate(-8deg); }
            70%  { transform: scale(0.9) rotate(4deg); }
            100% { transform: scale(1) rotate(0deg); }
        }
        .af-star-btn.af-star-pop {
            animation: af-star-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        /* ── Starred section header ── */
        .af-starred-section-label {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11.5px;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: hsl(var(--text-secondary, 210 10% 55%));
            padding: 8px 12px 5px;
            font-family: 'Inter', sans-serif;
            opacity: 0.7;
        }
        .af-starred-section-label svg {
            width: 15px;
            height: 15px;
            color: #f59e0b;
            flex-shrink: 0;
            filter: drop-shadow(0 0 2px rgba(245,158,11,0.4));
        }

        /* ── Starred clone items ── */
        [cmdk-item][data-af-starred-clone="true"] {
            background: rgba(245, 158, 11, 0.035) !important;
            border-left: 2px solid rgba(245, 158, 11, 0.25) !important;
            transition: background 0.15s ease, border-color 0.15s ease;
        }
        [cmdk-item][data-af-starred-clone="true"]:hover,
        [cmdk-item][data-af-starred-clone="true"][data-selected="true"] {
            background: rgba(245, 158, 11, 0.07) !important;
            border-left-color: rgba(245, 158, 11, 0.5) !important;
        }

        /* ── Divider ── */
        .af-starred-divider {
            height: 1px;
            background: hsl(var(--border-faint, 240 5% 22%));
            margin: 6px 10px 8px;
            opacity: 0.5;
        }

        /* ── Starred section entry animation ── */
        @keyframes af-section-in {
            from { opacity: 0; transform: translateY(-4px); }
            to   { opacity: 1; transform: translateY(0); }
        }
        [data-af-starred-section="1"] {
            animation: af-section-in 0.2s ease forwards;
        }

        /* ── Empty state ── */
        .af-starred-empty {
            display: flex;
            align-items: center;
            gap: 7px;
            padding: 7px 12px 9px;
            font-size: 17px;
            color: hsl(var(--text-muted, 240 5% 35%));
            font-family: 'Inter', sans-serif;
            font-style: italic;
            opacity: 0.6;
        }
        .af-starred-empty svg { width: 12px; height: 12px; flex-shrink: 0; }

        /* ── Count badge on starred section label ── */
        .af-starred-count {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 16px;
            height: 14px;
            padding: 0 4px;
            border-radius: 20px;
            background: rgba(245, 158, 11, 0.15);
            border: 1px solid rgba(245, 158, 11, 0.25);
            color: #f59e0b;
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0;
            margin-left: 1px;
        }
    `;
    document.head.appendChild(style);
}

// ── Star SVGs ──────────────────────────────────────────────────────────────────
function starSVG(filled) {
    return filled
        ? `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
               <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
           </svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
               <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
           </svg>`;
}

function getModelValue(item) {
    return item.getAttribute('data-value') || '';
}

// ── Build / update a star button ───────────────────────────────────────────────
function buildStarButton(modelValue) {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'af-star-btn' + (starredModels.has(modelValue) ? ' af-starred' : '');
    btn.setAttribute('data-af-model', modelValue);
    btn.setAttribute('aria-label', starredModels.has(modelValue) ? 'Unstar model' : 'Star model');
    btn.innerHTML = starSVG(starredModels.has(modelValue));
    btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        toggleStar(modelValue, btn);
    });
    return btn;
}

function refreshStarButton(btn, modelValue) {
    const isStarred = starredModels.has(modelValue);
    btn.classList.toggle('af-starred', isStarred);
    btn.setAttribute('aria-label', isStarred ? 'Unstar model' : 'Star model');
    btn.innerHTML = starSVG(isStarred);
}

// ── Toggle with animation ──────────────────────────────────────────────────────
function toggleStar(modelValue, triggerBtn) {
    const wasStarred = starredModels.has(modelValue);
    if (wasStarred) starredModels.delete(modelValue);
    else            starredModels.add(modelValue);

    chrome.storage.local.set({ [STORAGE_KEYS.STARRED_MODELS]: [...starredModels] });

    if (triggerBtn) {
        triggerBtn.classList.remove('af-star-pop');
        void triggerBtn.offsetWidth;
        triggerBtn.classList.add('af-star-pop');
        triggerBtn.addEventListener('animationend', () => triggerBtn.classList.remove('af-star-pop'), { once: true });
    }

    document.querySelectorAll(`.af-star-btn[data-af-model="${CSS.escape(modelValue)}"]`).forEach(btn => {
        refreshStarButton(btn, modelValue);
    });

    rebuildStarredSection();
}

// ── Inject star buttons into original items ────────────────────────────────────
function injectStarButtons() {
    document.querySelectorAll(`[cmdk-item]:not([data-af-starred-clone="true"])`).forEach(item => {
        if (item.querySelector('.af-star-btn')) return;
        const modelValue = getModelValue(item);
        if (!modelValue) return;

        lastKnownItems.set(modelValue, item);

        const iconsContainer = item.querySelector('.flex.flex-none.items-center.gap-2');
        if (!iconsContainer) return;

        const btn = buildStarButton(modelValue);
        iconsContainer.parentElement.insertBefore(btn, iconsContainer);
    });
}

// ── PERF FIX: isModelPickerOpen guard ─────────────────────────────────────────
// rebuildStarredSection clones DOM nodes for every starred model — expensive.
// It only makes sense when the cmdk model picker is actually visible.
// Calling it during chat streaming (when cmdk is closed) was pure waste.
function isModelPickerOpen() {
    return !!document.querySelector('[cmdk-list]');
}

// ── Rebuild the starred section at the top of the list ────────────────────────
function rebuildStarredSection() {
    document.querySelectorAll('[data-af-starred-section="1"]').forEach(el => el.remove());

    const listContainer = document.querySelector('[cmdk-list-sizer]');
    if (!listContainer) return;

    const section = document.createElement('div');
    section.setAttribute('data-af-starred-section', '1');

    const label = document.createElement('div');
    label.className = 'af-starred-section-label';

    const starredInList = [...starredModels].filter(mv =>
        listContainer.querySelector(`[cmdk-item][data-value="${CSS.escape(mv)}"]:not([data-af-starred-clone="true"])`)
    );

    label.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        Starred
        ${starredInList.length > 0 ? `<span class="af-starred-count">${starredInList.length}</span>` : ''}
    `;
    section.appendChild(label);

    if (starredInList.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'af-starred-empty';
        empty.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                      stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Hover a model and click ★ to star it
        `;
        section.appendChild(empty);
    } else {
        starredInList.forEach(modelValue => {
            const original = listContainer.querySelector(
                `[cmdk-item][data-value="${CSS.escape(modelValue)}"]:not([data-af-starred-clone="true"])`
            );
            if (!original) return;

            const clone = original.cloneNode(true);
            clone.setAttribute('data-af-starred-clone', 'true');
            clone.removeAttribute('id');
            clone.removeAttribute('data-selected');
            clone.removeAttribute('aria-selected');

            const existingStarBtn = clone.querySelector('.af-star-btn');
            if (existingStarBtn) {
                const newBtn = buildStarButton(modelValue);
                existingStarBtn.replaceWith(newBtn);
            }

            clone.addEventListener('click', e => {
                if (e.target.closest('.af-star-btn')) return;
                e.preventDefault();
                e.stopPropagation();
                original.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            });

            clone.addEventListener('mousedown', e => {
                if (e.target.closest('.af-star-btn')) return;
                original.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            });
            clone.addEventListener('pointerdown', e => {
                if (e.target.closest('.af-star-btn')) return;
                original.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
            });

            section.appendChild(clone);
        });
    }

    const divider = document.createElement('div');
    divider.className = 'af-starred-divider';
    section.appendChild(divider);

    listContainer.insertBefore(section, listContainer.firstChild);
}

// ── Enable / disable ───────────────────────────────────────────────────────────
function enableModelStarring() {
    injectStarringStyle();
    injectStarButtons();
    rebuildStarredSection();

    if (!starringObserver) {
        let debounce = null;
        starringObserver = new MutationObserver(records => {
            if (document.hidden) return;
            if (!isModelPickerOpen()) return;
            if (debounce) return;
            const hasAddedNodes = records.some(r => r.addedNodes.length > 0);
            if (!hasAddedNodes) return;
            debounce = setTimeout(() => {
                debounce = null;
                injectStarButtons();
                if (isModelPickerOpen() && !document.querySelector('[data-af-starred-section="1"]')) {
                    rebuildStarredSection();
                }
            }, 250);
        });
        starringObserver.observe(document.body, { childList: true, subtree: true });
    }
}

function disableModelStarring() {
    if (starringObserver) { starringObserver.disconnect(); starringObserver = null; }
    document.querySelectorAll('.af-star-btn').forEach(el => el.remove());
    document.querySelectorAll('[data-af-starred-section="1"]').forEach(el => el.remove());
    document.querySelectorAll('[data-af-starred-clone="true"]').forEach(el => el.remove());
    document.getElementById(IDS.MODEL_STARRING)?.remove();
    lastKnownItems.clear();
}

// ── Init ───────────────────────────────────────────────────────────────────────
chrome.storage.local.get([STORAGE_KEYS.ENABLE_STARRING, STORAGE_KEYS.STARRED_MODELS], data => {
    starringEnabled = !!data[STORAGE_KEYS.ENABLE_STARRING];
    starredModels   = new Set(data[STORAGE_KEYS.STARRED_MODELS] || []);
    if (starringEnabled) enableModelStarring();
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (STORAGE_KEYS.ENABLE_STARRING in changes) {
        starringEnabled = !!changes[STORAGE_KEYS.ENABLE_STARRING].newValue;
        starringEnabled ? enableModelStarring() : disableModelStarring();
    }
    if (STORAGE_KEYS.STARRED_MODELS in changes) {
        starredModels = new Set(changes[STORAGE_KEYS.STARRED_MODELS].newValue || []);
        document.querySelectorAll('.af-star-btn').forEach(btn => {
            const mv = btn.getAttribute('data-af-model');
            if (mv) refreshStarButton(btn, mv);
        });
        rebuildStarredSection();
    }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'REFRESH_MODEL_STARRING' && message?.type !== MSG.REFRESH_STARRING) return;
    chrome.storage.local.get([STORAGE_KEYS.ENABLE_STARRING, STORAGE_KEYS.STARRED_MODELS], data => {
        starringEnabled = !!data[STORAGE_KEYS.ENABLE_STARRING];
        starredModels   = new Set(data[STORAGE_KEYS.STARRED_MODELS] || []);
        starringEnabled ? enableModelStarring() : disableModelStarring();
    });
    sendResponse({ ok: true });
    return true;
});