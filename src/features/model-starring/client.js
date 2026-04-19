const MODEL_STARRING_STYLE_ID = 'arena-fixes-model-starring-style';
let starringEnabled = false;
let starredModels = new Set();
let starringObserver = null;

// ── Styles ─────────────────────────────────────────────────────────────────
function injectStarringStyle() {
    if (document.getElementById(MODEL_STARRING_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = MODEL_STARRING_STYLE_ID;
    style.textContent = `
        .af-star-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
            border: none;
            background: transparent;
            cursor: pointer;
            padding: 0;
            flex-shrink: 0;
            color: hsl(var(--text-muted, 240 5% 40%));
            opacity: 0;
            transition: opacity 0.15s ease, color 0.15s ease, transform 0.15s ease;
            border-radius: 4px;
        }
        [cmdk-item]:hover .af-star-btn,
        [cmdk-item][data-selected="true"] .af-star-btn {
            opacity: 1;
        }
        .af-star-btn.af-starred {
            opacity: 1;
            color: #f59e0b;
        }
        .af-star-btn:hover {
            color: #f59e0b;
            transform: scale(1.15);
        }
        .af-star-btn svg {
            width: 13px;
            height: 13px;
            pointer-events: none;
        }
        .af-starred-section-label {
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.07em;
            text-transform: uppercase;
            color: hsl(var(--text-secondary, 210 10% 55%));
            padding: 8px 12px 4px;
            font-family: 'Inter', sans-serif;
        }
        [cmdk-item][data-af-starred-clone="true"] {
            background: rgba(245, 158, 11, 0.04);
        }
        [cmdk-item][data-af-starred-clone="true"]:hover,
        [cmdk-item][data-af-starred-clone="true"][data-selected="true"] {
            background: rgba(245, 158, 11, 0.08);
        }
        .af-starred-divider {
            height: 1px;
            background: hsl(var(--border-faint, 240 5% 22%));
            margin: 4px 12px 8px;
        }
    `;
    document.head.appendChild(style);
}

// ── Star SVG ────────────────────────────────────────────────────────────────
function starSVG(filled) {
    return filled
        ? `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
               <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
           </svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
               <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
           </svg>`;
}

// ── Get model value from a cmdk-item ────────────────────────────────────────
function getModelValue(item) {
    return item.getAttribute('data-value') || '';
}

// ── Build star button ────────────────────────────────────────────────────────
function buildStarButton(modelValue) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'af-star-btn' + (starredModels.has(modelValue) ? ' af-starred' : '');
    btn.setAttribute('data-af-model', modelValue);
    btn.setAttribute('aria-label', starredModels.has(modelValue) ? 'Unstar model' : 'Star model');
    btn.innerHTML = starSVG(starredModels.has(modelValue));

    btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        toggleStar(modelValue);
    });

    return btn;
}

// ── Toggle star ──────────────────────────────────────────────────────────────
function toggleStar(modelValue) {
    if (starredModels.has(modelValue)) {
        starredModels.delete(modelValue);
    } else {
        starredModels.add(modelValue);
    }

    // Persist
    chrome.storage.local.set({ starredModels: [...starredModels] });

    // Update all star buttons for this model
    document.querySelectorAll(`.af-star-btn[data-af-model="${CSS.escape(modelValue)}"]`).forEach(btn => {
        const isStarred = starredModels.has(modelValue);
        btn.classList.toggle('af-starred', isStarred);
        btn.setAttribute('aria-label', isStarred ? 'Unstar model' : 'Star model');
        btn.innerHTML = starSVG(isStarred);
    });

    // Rebuild the starred section
    rebuildStarredSection();
}

// ── Inject star buttons into visible cmdk-items ──────────────────────────────
function injectStarButtons() {
    const items = document.querySelectorAll('[cmdk-item]:not([data-af-starred-clone="true"])');
    items.forEach(item => {
        if (item.querySelector('.af-star-btn')) return;

        const modelValue = getModelValue(item);
        if (!modelValue) return;

        // Find the icons container (flex.items-center.gap-2 at the end)
        const iconsContainer = item.querySelector('.flex.flex-none.items-center.gap-2');
        if (!iconsContainer) return;

        const btn = buildStarButton(modelValue);
        // Insert before the icons container
        iconsContainer.parentElement.insertBefore(btn, iconsContainer);
    });
}

// ── Rebuild starred section at top ────────────────────────────────────────────
function rebuildStarredSection() {
    // Remove existing starred section
    document.querySelectorAll('[data-af-starred-section]').forEach(el => el.remove());

    if (starredModels.size === 0) return;

    // Find the cmdk list container
    const listContainer = document.querySelector('[cmdk-list-sizer]');
    if (!listContainer) return;

    // Find starred items among real items
    const starredItems = [];
    starredModels.forEach(modelValue => {
        const item = listContainer.querySelector(`[cmdk-item][data-value="${CSS.escape(modelValue)}"]:not([data-af-starred-clone="true"])`);
        if (item) starredItems.push({ item, modelValue });
    });

    if (starredItems.length === 0) return;

    // Build section wrapper
    const section = document.createElement('div');
    section.setAttribute('data-af-starred-section', '1');

    // Label
    const label = document.createElement('div');
    label.className = 'af-starred-section-label';
    label.textContent = '★ Starred';
    section.appendChild(label);

    // Clone starred items
    starredItems.forEach(({ item, modelValue }) => {
        const clone = item.cloneNode(true);
        clone.setAttribute('data-af-starred-clone', 'true');
        clone.removeAttribute('id'); // avoid duplicate IDs

        // Update star button in clone to reflect starred state
        const starBtn = clone.querySelector('.af-star-btn');
        if (starBtn) {
            starBtn.classList.add('af-starred');
            starBtn.innerHTML = starSVG(true);
            starBtn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                toggleStar(modelValue);
            });
        }

        // Wire up click to behave like the original item
        clone.addEventListener('click', e => {
            if (e.target.closest('.af-star-btn')) return;
            item.click();
        });

        section.appendChild(clone);
    });

    // Divider
    const divider = document.createElement('div');
    divider.className = 'af-starred-divider';
    section.appendChild(divider);

    // Insert at the very top of the list
    listContainer.insertBefore(section, listContainer.firstChild);
}

// ── Enable / disable ─────────────────────────────────────────────────────────
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
                // Only rebuild if section is missing (avoid flicker)
                if (!document.querySelector('[data-af-starred-section]') && starredModels.size > 0) {
                    rebuildStarredSection();
                }
            }, 120);
        });
        starringObserver.observe(document.body, { childList: true, subtree: true });
    }
}

function disableModelStarring() {
    if (starringObserver) {
        starringObserver.disconnect();
        starringObserver = null;
    }
    // Remove star buttons
    document.querySelectorAll('.af-star-btn').forEach(el => el.remove());
    // Remove starred section
    document.querySelectorAll('[data-af-starred-section]').forEach(el => el.remove());
    // Remove clones
    document.querySelectorAll('[data-af-starred-clone="true"]').forEach(el => el.remove());
    // Remove style
    document.getElementById(MODEL_STARRING_STYLE_ID)?.remove();
}

// ── Init ─────────────────────────────────────────────────────────────────────
chrome.storage.local.get(['enableStarringEnabled', 'starredModels'], data => {
    starringEnabled = !!data.enableStarringEnabled;
    starredModels = new Set(data.starredModels || []);
    if (starringEnabled) enableModelStarring();
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if ('enableStarringEnabled' in changes) {
        starringEnabled = !!changes.enableStarringEnabled.newValue;
        starringEnabled ? enableModelStarring() : disableModelStarring();
    }
    if ('starredModels' in changes) {
        starredModels = new Set(changes.starredModels.newValue || []);
    }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'REFRESH_MODEL_STARRING') return;
    chrome.storage.local.get(['enableStarringEnabled', 'starredModels'], data => {
        starringEnabled = !!data.enableStarringEnabled;
        starredModels = new Set(data.starredModels || []);
        starringEnabled ? enableModelStarring() : disableModelStarring();
    });
    sendResponse({ ok: true });
    return true;
});