// Content-script side for Model Starring.
// constants.js is loaded first by the manifest and exposes STORAGE_KEYS, MSG, IDS, ATTR as globals.

let starringEnabled  = false;
let starredModels    = new Set();
let starringObserver = null;

// ── Styles ─────────────────────────────────────────────────────────────────────
function injectStarringStyle() {
    if (document.getElementById(IDS.MODEL_STARRING)) return;
    const style = document.createElement('style');
    style.id = IDS.MODEL_STARRING;
    style.textContent = `
        .af-star-btn {
            display: inline-flex; align-items: center; justify-content: center;
            width: 20px; height: 20px; border: none; background: transparent;
            cursor: pointer; padding: 0; flex-shrink: 0;
            color: hsl(var(--text-muted, 240 5% 40%)); opacity: 0;
            transition: opacity 0.15s ease, color 0.15s ease, transform 0.15s ease;
            border-radius: 4px;
        }
        [cmdk-item]:hover .af-star-btn,
        [cmdk-item][data-selected="true"] .af-star-btn { opacity: 1; }
        .af-star-btn.af-starred { opacity: 1; color: #f59e0b; }
        .af-star-btn:hover { color: #f59e0b; transform: scale(1.15); }
        .af-star-btn svg { width: 18px; height: 18px; pointer-events: none; }
        .af-starred-section-label {
            font-size: 11px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase;
            color: hsl(var(--text-secondary, 210 10% 55%)); padding: 8px 12px 4px;
            font-family: 'Inter', sans-serif;
        }
        [cmdk-item][${ATTR.STARRED_CLONE}="true"] { background: rgba(245, 158, 11, 0.04); }
        [cmdk-item][${ATTR.STARRED_CLONE}="true"]:hover,
        [cmdk-item][${ATTR.STARRED_CLONE}="true"][data-selected="true"] { background: rgba(245, 158, 11, 0.08); }
        .af-starred-divider { height: 1px; background: hsl(var(--border-faint, 240 5% 22%)); margin: 4px 12px 8px; }
    `;
    document.head.appendChild(style);
}

// ── Star SVG ───────────────────────────────────────────────────────────────────
function starSVG(filled) {
    return filled
        ? `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
}

function getModelValue(item) {
    return item.getAttribute('data-value') || '';
}

function buildStarButton(modelValue) {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'af-star-btn' + (starredModels.has(modelValue) ? ' af-starred' : '');
    btn.setAttribute(ATTR.AF_MODEL, modelValue);
    btn.setAttribute('aria-label', starredModels.has(modelValue) ? 'Unstar model' : 'Star model');
    btn.innerHTML = starSVG(starredModels.has(modelValue));
    btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggleStar(modelValue); });
    return btn;
}

function toggleStar(modelValue) {
    if (starredModels.has(modelValue)) starredModels.delete(modelValue);
    else starredModels.add(modelValue);

    chrome.storage.local.set({ [STORAGE_KEYS.STARRED_MODELS]: [...starredModels] });

    document.querySelectorAll(`.af-star-btn[${ATTR.AF_MODEL}="${CSS.escape(modelValue)}"]`).forEach(btn => {
        const isStarred = starredModels.has(modelValue);
        btn.classList.toggle('af-starred', isStarred);
        btn.setAttribute('aria-label', isStarred ? 'Unstar model' : 'Star model');
        btn.innerHTML = starSVG(isStarred);
    });

    rebuildStarredSection();
}

function injectStarButtons() {
    document.querySelectorAll(`[cmdk-item]:not([${ATTR.STARRED_CLONE}="true"])`).forEach(item => {
        if (item.querySelector('.af-star-btn')) return;
        const modelValue = getModelValue(item);
        if (!modelValue) return;
        const iconsContainer = item.querySelector('.flex.flex-none.items-center.gap-2');
        if (!iconsContainer) return;
        iconsContainer.parentElement.insertBefore(buildStarButton(modelValue), iconsContainer);
    });
}

function rebuildStarredSection() {
    document.querySelectorAll(`[${ATTR.STARRED_SECTION}]`).forEach(el => el.remove());
    if (starredModels.size === 0) return;

    const listContainer = document.querySelector('[cmdk-list-sizer]');
    if (!listContainer) return;

    const starredItems = [];
    starredModels.forEach(modelValue => {
        const item = listContainer.querySelector(`[cmdk-item][data-value="${CSS.escape(modelValue)}"]:not([${ATTR.STARRED_CLONE}="true"])`);
        if (item) starredItems.push({ item, modelValue });
    });
    if (starredItems.length === 0) return;

    const section = document.createElement('div');
    section.setAttribute(ATTR.STARRED_SECTION, '1');

    const label = document.createElement('div');
    label.className   = 'af-starred-section-label';
    label.textContent = '★ Starred';
    section.appendChild(label);

    starredItems.forEach(({ item, modelValue }) => {
        const clone = item.cloneNode(true);
        clone.setAttribute(ATTR.STARRED_CLONE, 'true');
        clone.removeAttribute('id');

        const starBtn = clone.querySelector('.af-star-btn');
        if (starBtn) {
            starBtn.classList.add('af-starred');
            starBtn.innerHTML = starSVG(true);
            starBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggleStar(modelValue); });
        }
        clone.addEventListener('click', e => { if (e.target.closest('.af-star-btn')) return; item.click(); });
        section.appendChild(clone);
    });

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
        starringObserver = new MutationObserver(() => {
            if (debounce) return;
            debounce = setTimeout(() => {
                debounce = null;
                injectStarButtons();
                if (!document.querySelector(`[${ATTR.STARRED_SECTION}]`) && starredModels.size > 0) rebuildStarredSection();
            }, 120);
        });
        starringObserver.observe(document.body, { childList: true, subtree: true });
    }
}

function disableModelStarring() {
    if (starringObserver) { starringObserver.disconnect(); starringObserver = null; }
    document.querySelectorAll('.af-star-btn').forEach(el => el.remove());
    document.querySelectorAll(`[${ATTR.STARRED_SECTION}]`).forEach(el => el.remove());
    document.querySelectorAll(`[${ATTR.STARRED_CLONE}="true"]`).forEach(el => el.remove());
    document.getElementById(IDS.MODEL_STARRING)?.remove();
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
    }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== MSG.REFRESH_MODEL_STARRING) return;
    chrome.storage.local.get([STORAGE_KEYS.ENABLE_STARRING, STORAGE_KEYS.STARRED_MODELS], data => {
        starringEnabled = !!data[STORAGE_KEYS.ENABLE_STARRING];
        starredModels   = new Set(data[STORAGE_KEYS.STARRED_MODELS] || []);
        starringEnabled ? enableModelStarring() : disableModelStarring();
    });
    sendResponse({ ok: true });
    return true;
});