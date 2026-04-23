// Content-script side for Prompt History / Autosave.
// constants.js is loaded first by the manifest and exposes STORAGE_KEYS, MSG, IDS, ATTR as globals.

const PROMPT_HISTORY_LS_KEY  = 'af_prompt_history';
const PROMPT_DRAFT_LS_KEY    = 'af_prompt_draft';
const PROMPT_HISTORY_STYLE_ID = 'arena-fixes-prompt-history-style';
const MAX_HISTORY             = 30;
const MIN_SAVE_LENGTH         = 15;   // chars needed to auto-save
const SAVE_DEBOUNCE_MS        = 800;  // wait after last keystroke before saving draft

let promptHistoryEnabled = false;
let historyObserver      = null;
let saveDebounceTmr      = null;
let panelOpen            = false;

// ── localStorage helpers ───────────────────────────────────────────────────────

function loadHistory() {
    try { return JSON.parse(localStorage.getItem(PROMPT_HISTORY_LS_KEY) || '[]'); }
    catch { return []; }
}
function saveHistory(arr) {
    try { localStorage.setItem(PROMPT_HISTORY_LS_KEY, JSON.stringify(arr)); } catch {}
}
function loadDraft() {
    try { return JSON.parse(localStorage.getItem(PROMPT_DRAFT_LS_KEY) || 'null'); }
    catch { return null; }
}
function saveDraft(text) {
    try {
        if (text && text.length >= MIN_SAVE_LENGTH) {
            localStorage.setItem(PROMPT_DRAFT_LS_KEY, JSON.stringify({ text, ts: Date.now() }));
        } else {
            localStorage.removeItem(PROMPT_DRAFT_LS_KEY);
        }
    } catch {}
}
function clearDraft() {
    try { localStorage.removeItem(PROMPT_DRAFT_LS_KEY); } catch {}
}
function addToHistory(text) {
    if (!text || text.trim().length < MIN_SAVE_LENGTH) return;
    const trimmed = text.trim();
    const history = loadHistory();
    const deduped = history.filter(item => item.text !== trimmed);
    deduped.unshift({ text: trimmed, ts: Date.now() });
    if (deduped.length > MAX_HISTORY) deduped.length = MAX_HISTORY;
    saveHistory(deduped);
}
function deleteFromHistory(ts) {
    saveHistory(loadHistory().filter(item => item.ts !== ts));
}
function clearHistory() {
    saveHistory([]);
}

// ── Textarea helper (same pattern as enhance-prompt) ──────────────────────────

function setTextareaValue(textarea, value) {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (nativeSetter) nativeSetter.call(textarea, value);
    else textarea.value = value;
    textarea.dispatchEvent(new Event('input',  { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

// ── Time helpers ───────────────────────────────────────────────────────────────

function timeAgo(ts) {
    const diff = Date.now() - ts;
    const s = Math.floor(diff / 1000);
    if (s < 60)  return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60)  return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

function truncate(text, maxLen = 120) {
    return text.length <= maxLen ? text : text.slice(0, maxLen).trimEnd() + '…';
}

// ── Style injection ────────────────────────────────────────────────────────────

function injectHistoryStyle() {
    if (document.getElementById(PROMPT_HISTORY_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PROMPT_HISTORY_STYLE_ID;
    style.textContent = `
        /* ── History button ── */
        .af-ph-wrap {
            display: inline-flex;
            align-items: center;
            position: relative;
            flex-shrink: 0;
        }

        .af-ph-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: 6px;
            border: 1px solid hsl(var(--border-faint, 240 5% 22%));
            background: transparent;
            color: hsl(var(--text-secondary, 210 10% 55%));
            cursor: pointer;
            transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
            padding: 0;
            position: relative;
        }
        .af-ph-btn:hover {
            color: hsl(var(--text-primary, 0 0% 92%));
            background: rgba(255,255,255,0.05);
        }
        .af-ph-btn.af-ph-has-draft {
            border-color: rgba(245,158,11,0.45);
            color: #f59e0b;
        }
        .af-ph-btn.af-ph-has-draft:hover {
            background: rgba(245,158,11,0.08);
        }
        .af-ph-btn svg { width: 14px; height: 14px; pointer-events: none; }

        .af-ph-dot {
            position: absolute;
            top: 4px;
            right: 4px;
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: #f59e0b;
            display: none;
            border: 1px solid rgba(0,0,0,0.3);
        }
        .af-ph-btn.af-ph-has-draft .af-ph-dot { display: block; }

        .af-ph-tooltip {
            position: absolute;
            bottom: calc(100% + 6px);
            left: 50%;
            transform: translateX(-50%);
            background: #111;
            color: #eaeaea;
            font-size: 11px;
            font-family: 'Inter', sans-serif;
            white-space: nowrap;
            padding: 4px 8px;
            border-radius: 5px;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.15s ease;
            border: 1px solid #333;
            z-index: 9999;
        }
        .af-ph-btn:hover .af-ph-tooltip { opacity: 1; }

        /* ── Panel ── */
        .af-ph-panel {
            position: absolute;
            bottom: calc(100% + 10px);
            right: 0;
            width: 340px;
            max-height: 420px;
            background: #141414;
            border: 1px solid #2a2a2a;
            border-radius: 12px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.6);
            z-index: 9999;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            animation: af-ph-panel-in 0.18s cubic-bezier(0.16,1,0.3,1);
            font-family: 'Inter', system-ui, sans-serif;
        }
        @keyframes af-ph-panel-in {
            from { opacity: 0; transform: translateY(6px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .af-ph-panel-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 11px 13px 10px;
            border-bottom: 1px solid #1e1e1e;
            flex-shrink: 0;
        }
        .af-ph-panel-title {
            display: flex;
            align-items: center;
            gap: 7px;
            font-size: 11.5px;
            font-weight: 600;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: #555;
        }
        .af-ph-panel-title svg { width: 12px; height: 12px; flex-shrink: 0; }

        .af-ph-clear-btn {
            font-size: 11px;
            font-family: inherit;
            color: #3a3a3a;
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 2px 6px;
            border-radius: 4px;
            transition: color 0.12s, background 0.12s;
        }
        .af-ph-clear-btn:hover { color: #ef4444; background: rgba(239,68,68,0.08); }

        /* ── Draft banner ── */
        .af-ph-draft-banner {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 10px 13px;
            background: rgba(245,158,11,0.05);
            border-bottom: 1px solid rgba(245,158,11,0.12);
            flex-shrink: 0;
        }
        .af-ph-draft-icon {
            width: 28px;
            height: 28px;
            border-radius: 6px;
            background: rgba(245,158,11,0.12);
            border: 1px solid rgba(245,158,11,0.2);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            color: #f59e0b;
        }
        .af-ph-draft-icon svg { width: 13px; height: 13px; }
        .af-ph-draft-info { flex: 1; min-width: 0; }
        .af-ph-draft-label {
            font-size: 10.5px;
            font-weight: 600;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            color: #a37a00;
            margin-bottom: 3px;
        }
        .af-ph-draft-preview {
            font-size: 12px;
            color: #999;
            line-height: 1.45;
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
        }
        .af-ph-draft-restore {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            margin-top: 6px;
            font-size: 11px;
            font-weight: 600;
            font-family: inherit;
            color: #f59e0b;
            background: rgba(245,158,11,0.1);
            border: 1px solid rgba(245,158,11,0.25);
            border-radius: 5px;
            padding: 3px 9px;
            cursor: pointer;
            transition: background 0.12s, border-color 0.12s;
        }
        .af-ph-draft-restore:hover {
            background: rgba(245,158,11,0.18);
            border-color: rgba(245,158,11,0.4);
        }
        .af-ph-draft-restore svg { width: 10px; height: 10px; }

        /* ── History list ── */
        .af-ph-list {
            overflow-y: auto;
            flex: 1;
            scrollbar-width: thin;
            scrollbar-color: #222 transparent;
        }
        .af-ph-list::-webkit-scrollbar { width: 4px; }
        .af-ph-list::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 4px; }

        .af-ph-section-label {
            font-size: 10px;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #404040;
            padding: 9px 13px 5px;
        }

        .af-ph-item {
            display: flex;
            align-items: flex-start;
            gap: 9px;
            padding: 9px 13px;
            border-bottom: 1px solid #111;
            transition: background 0.1s ease;
            cursor: default;
        }
        .af-ph-item:last-child { border-bottom: none; }
        .af-ph-item:hover { background: rgba(255,255,255,0.025); }

        .af-ph-item-body { flex: 1; min-width: 0; }
        .af-ph-item-text {
            font-size: 12.5px;
            color: #888;
            line-height: 1.5;
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            margin-bottom: 4px;
            word-break: break-word;
        }
        .af-ph-item:hover .af-ph-item-text { color: #bbb; }
        .af-ph-item-meta {
            font-size: 10.5px;
            color: #3a3a3a;
        }

        .af-ph-item-actions {
            display: flex;
            align-items: center;
            gap: 4px;
            flex-shrink: 0;
            opacity: 0;
            transition: opacity 0.12s;
        }
        .af-ph-item:hover .af-ph-item-actions { opacity: 1; }

        .af-ph-insert-btn, .af-ph-del-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border-radius: 5px;
            border: none;
            cursor: pointer;
            transition: background 0.1s, color 0.1s;
            padding: 0;
        }
        .af-ph-insert-btn {
            background: rgba(255,255,255,0.05);
            color: #777;
        }
        .af-ph-insert-btn:hover { background: rgba(255,255,255,0.1); color: #ddd; }
        .af-ph-del-btn {
            background: transparent;
            color: #444;
        }
        .af-ph-del-btn:hover { background: rgba(239,68,68,0.1); color: #ef4444; }
        .af-ph-insert-btn svg, .af-ph-del-btn svg { width: 12px; height: 12px; pointer-events: none; }

        /* ── Empty state ── */
        .af-ph-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 28px 20px;
            gap: 10px;
            color: #333;
        }
        .af-ph-empty svg { width: 28px; height: 28px; opacity: 0.3; }
        .af-ph-empty-title {
            font-size: 13px;
            font-weight: 500;
            color: #444;
        }
        .af-ph-empty-desc {
            font-size: 11.5px;
            color: #333;
            text-align: center;
            line-height: 1.5;
        }

        /* ── Saved flash ── */
        @keyframes af-ph-saved-flash {
            0%   { opacity: 1; }
            50%  { opacity: 0.4; }
            100% { opacity: 1; }
        }
        .af-ph-btn.af-ph-saved {
            animation: af-ph-saved-flash 0.5s ease;
        }
    `;
    document.head.appendChild(style);
}

// ── Panel UI ───────────────────────────────────────────────────────────────────

function buildPanel(textarea, wrap, btn) {
    const panel = document.createElement('div');
    panel.className = 'af-ph-panel';
    panel.id = 'af-ph-panel-instance';

    renderPanel(panel, textarea, btn);
    return panel;
}

function renderPanel(panel, textarea, btn) {
    panel.innerHTML = '';

    const history = loadHistory();
    const draft   = loadDraft();
    const hasDraft = draft && draft.text && draft.text.length >= MIN_SAVE_LENGTH;
    const currentVal = textarea.value.trim();
    // Only show draft if it differs from what's currently in the box
    const showDraft = hasDraft && draft.text !== currentVal;

    // ── Header ──
    const header = document.createElement('div');
    header.className = 'af-ph-panel-header';

    const title = document.createElement('div');
    title.className = 'af-ph-panel-title';
    title.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
             stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 7v5l3 3"/>
        </svg>
        Prompt History
    `;

    const clearBtn = document.createElement('button');
    clearBtn.className = 'af-ph-clear-btn';
    clearBtn.textContent = 'Clear all';
    clearBtn.addEventListener('click', e => {
        e.stopPropagation();
        clearHistory();
        clearDraft();
        renderPanel(panel, textarea, btn);
        syncBtnState(btn);
    });

    header.appendChild(title);
    header.appendChild(clearBtn);
    panel.appendChild(header);

    // ── Draft banner ──
    if (showDraft) {
        const banner = document.createElement('div');
        banner.className = 'af-ph-draft-banner';
        banner.innerHTML = `
            <div class="af-ph-draft-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                     stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
            </div>
            <div class="af-ph-draft-info">
                <div class="af-ph-draft-label">Unsaved Draft • ${timeAgo(draft.ts)}</div>
                <div class="af-ph-draft-preview">${escHtml(truncate(draft.text, 140))}</div>
                <button class="af-ph-draft-restore">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                        <path d="M3 3v5h5"/>
                    </svg>
                    Restore Draft
                </button>
            </div>
        `;

        banner.querySelector('.af-ph-draft-restore').addEventListener('click', e => {
            e.stopPropagation();
            setTextareaValue(textarea, draft.text);
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
            closePanel();
        });

        panel.appendChild(banner);
    }

    // ── History list ──
    const list = document.createElement('div');
    list.className = 'af-ph-list';

    if (history.length === 0 && !showDraft) {
        const empty = document.createElement('div');
        empty.className = 'af-ph-empty';
        empty.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                 stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9"/>
                <path d="M12 7v5l3 3"/>
            </svg>
            <div class="af-ph-empty-title">No saved prompts yet</div>
            <div class="af-ph-empty-desc">
                Prompts you send or type will be<br>automatically saved here.
            </div>
        `;
        list.appendChild(empty);
    } else {
        if (history.length > 0) {
            const sectionLabel = document.createElement('div');
            sectionLabel.className = 'af-ph-section-label';
            sectionLabel.textContent = `Recent (${history.length})`;
            list.appendChild(sectionLabel);

            history.forEach(item => {
                const row = document.createElement('div');
                row.className = 'af-ph-item';

                const body = document.createElement('div');
                body.className = 'af-ph-item-body';
                body.innerHTML = `
                    <div class="af-ph-item-text">${escHtml(truncate(item.text, 160))}</div>
                    <div class="af-ph-item-meta">${timeAgo(item.ts)}</div>
                `;

                const actions = document.createElement('div');
                actions.className = 'af-ph-item-actions';

                const insertBtn = document.createElement('button');
                insertBtn.type = 'button';
                insertBtn.className = 'af-ph-insert-btn';
                insertBtn.title = 'Insert into prompt';
                insertBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 18l6-6-6-6"/>
                    </svg>
                `;
                insertBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    setTextareaValue(textarea, item.text);
                    textarea.focus();
                    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
                    closePanel();
                });

                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'af-ph-del-btn';
                delBtn.title = 'Remove from history';
                delBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 6 6 18M6 6l12 12"/>
                    </svg>
                `;
                delBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    deleteFromHistory(item.ts);
                    renderPanel(panel, textarea, btn);
                    syncBtnState(btn);
                });

                actions.appendChild(insertBtn);
                actions.appendChild(delBtn);
                row.appendChild(body);
                row.appendChild(actions);
                list.appendChild(row);
            });
        }
    }

    panel.appendChild(list);
}

function escHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Panel open/close ───────────────────────────────────────────────────────────

function closePanel() {
    document.getElementById('af-ph-panel-instance')?.remove();
    panelOpen = false;
}

function togglePanel(textarea, wrap, btn) {
    if (panelOpen) {
        closePanel();
        return;
    }
    panelOpen = true;
    const panel = buildPanel(textarea, wrap, btn);
    wrap.appendChild(panel);

    // Close on outside click
    const onOutside = e => {
        if (!wrap.contains(e.target)) {
            closePanel();
            document.removeEventListener('click', onOutside, true);
        }
    };
    setTimeout(() => document.addEventListener('click', onOutside, true), 0);
}

// ── Button state sync ──────────────────────────────────────────────────────────

function syncBtnState(btn) {
    const draft = loadDraft();
    const hasDraft = draft && draft.text && draft.text.length >= MIN_SAVE_LENGTH;
    btn.classList.toggle('af-ph-has-draft', hasDraft);

    // Refresh open panel if any
    const panel = document.getElementById('af-ph-panel-instance');
    if (panel) {
        const textarea = document.querySelector("textarea[name='message'], textarea[placeholder*='Ask'], textarea[data-testid='textbox']");
        if (textarea) renderPanel(panel, textarea, btn);
    }
}

// ── Auto-save logic ────────────────────────────────────────────────────────────

function onTextareaInput(textarea, btn) {
    const text = textarea.value;

    // Save as draft on every keystroke (debounced)
    if (saveDebounceTmr) clearTimeout(saveDebounceTmr);
    saveDebounceTmr = setTimeout(() => {
        saveDraft(text);
        syncBtnState(btn);
    }, SAVE_DEBOUNCE_MS);
}

function onFormSubmit(textarea) {
    // When form submits, save the prompt to history and clear draft
    const text = textarea.value.trim();
    if (text.length >= MIN_SAVE_LENGTH) {
        addToHistory(text);
        clearDraft();
    }
}

// ── Build the button ───────────────────────────────────────────────────────────

function buildHistoryButton(textarea) {
    const wrap = document.createElement('div');
    wrap.className = 'af-ph-wrap';
    wrap.setAttribute('data-af-ph-wrap', '1');

    const draft = loadDraft();
    const hasDraft = draft && draft.text && draft.text.length >= MIN_SAVE_LENGTH;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'af-ph-btn' + (hasDraft ? ' af-ph-has-draft' : '');
    btn.setAttribute('aria-label', 'Prompt history');
    btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
             stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 7v5l3 3"/>
        </svg>
        <span class="af-ph-dot"></span>
        <span class="af-ph-tooltip">Prompt History</span>
    `;

    btn.addEventListener('click', e => {
        e.stopPropagation();
        togglePanel(textarea, wrap, btn);
    });

    // Auto-save on input
    textarea.addEventListener('input', () => onTextareaInput(textarea, btn));

    // Save to history on submit (listen to the form's submit + submit button click)
    const form = textarea.closest('form');
    if (form) {
        form.addEventListener('submit', () => onFormSubmit(textarea), { capture: true });

        // Also intercept submit button clicks (arena uses button[type=submit])
        const interceptSubmit = e => {
            const submitBtn = e.target.closest('button[type="submit"]');
            if (submitBtn && form.contains(submitBtn)) onFormSubmit(textarea);
        };
        form.addEventListener('click', interceptSubmit, true);

        // Also watch for Enter key (arena submits on Enter)
        textarea.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) onFormSubmit(textarea);
        });
    }

    wrap.appendChild(btn);
    return wrap;
}

// ── Inject / remove ────────────────────────────────────────────────────────────

function injectHistoryButton() {
    const textareas = document.querySelectorAll(
        "textarea[name='message'], textarea[placeholder*='Ask'], textarea[data-testid='textbox']"
    );
    textareas.forEach(textarea => {
        if (textarea.dataset.afPhInjected === '1') return;

        const form = textarea.closest('form') || textarea.parentNode;
        if (!form) return;
        if (form.querySelector('[data-af-ph-wrap]')) return;

        textarea.dataset.afPhInjected = '1';
        const wrap = buildHistoryButton(textarea);

        // Inject before the enhance-wrap (or before the think-wrap, or before submit)
        const enhanceWrap = form.querySelector('.af-enhance-wrap');
        const thinkWrap   = form.querySelector('[data-af-think-wrap]');
        const submitBtn   = form.querySelector(
            "button[type='submit'], button[aria-label*='Send'], button[id*='submit']"
        );

        if (enhanceWrap) {
            enhanceWrap.parentNode.insertBefore(wrap, enhanceWrap);
        } else if (thinkWrap) {
            thinkWrap.parentNode.insertBefore(wrap, thinkWrap);
        } else if (submitBtn?.parentNode) {
            submitBtn.parentNode.insertBefore(wrap, submitBtn);
        } else {
            textarea.parentNode?.insertBefore(wrap, textarea.nextSibling);
        }
    });
}

function removeHistoryButton() {
    closePanel();
    document.querySelectorAll('[data-af-ph-wrap]').forEach(el => el.remove());
    document.querySelectorAll('textarea[data-af-ph-injected]').forEach(ta => {
        delete ta.dataset.afPhInjected;
    });
}

// ── Enable / disable ───────────────────────────────────────────────────────────

function enablePromptHistory() {
    injectHistoryStyle();
    injectHistoryButton();

    if (!historyObserver) {
        let debounce = null;
        historyObserver = new MutationObserver(() => {
            if (debounce) return;
            debounce = setTimeout(() => { debounce = null; injectHistoryButton(); }, 150);
        });
        historyObserver.observe(document.body, { childList: true, subtree: true });
    }
}

function disablePromptHistory() {
    removeHistoryButton();
    if (historyObserver) { historyObserver.disconnect(); historyObserver = null; }
    document.getElementById(PROMPT_HISTORY_STYLE_ID)?.remove();
}

// ── Init ───────────────────────────────────────────────────────────────────────

chrome.storage.local.get([STORAGE_KEYS.PROMPT_HISTORY_ENABLED], data => {
    promptHistoryEnabled = !!data[STORAGE_KEYS.PROMPT_HISTORY_ENABLED];
    if (promptHistoryEnabled) enablePromptHistory();
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (STORAGE_KEYS.PROMPT_HISTORY_ENABLED in changes) {
        promptHistoryEnabled = !!changes[STORAGE_KEYS.PROMPT_HISTORY_ENABLED].newValue;
        promptHistoryEnabled ? enablePromptHistory() : disablePromptHistory();
    }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== MSG.REFRESH_PROMPT_HISTORY) return;
    chrome.storage.local.get([STORAGE_KEYS.PROMPT_HISTORY_ENABLED], data => {
        promptHistoryEnabled = !!data[STORAGE_KEYS.PROMPT_HISTORY_ENABLED];
        promptHistoryEnabled ? enablePromptHistory() : disablePromptHistory();
    });
    sendResponse({ ok: true });
    return true;
});