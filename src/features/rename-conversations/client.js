// ─────────────────────────────────────────────────────────────────────────────
// Conversation Actions — Pin · Rename · Color Label · Folders · Copy Link
// ─────────────────────────────────────────────────────────────────────────────

const RENAME_LS_KEY       = 'af_conv_names';
const PIN_LS_KEY          = 'af_conv_pins';
const COLOR_LS_KEY        = 'af_conv_colors';
const FOLDERS_LS_KEY      = 'af_conv_folders';
const FOLDER_ITEMS_LS_KEY = 'af_conv_folder_items';
const RENAME_INJECTED     = 'data-af-ca-done';

let renameEnabled  = false;
let renameObserver = null;
let menuObserver   = null;
let _activeModal   = null;
let _lastActiveLi  = null;

// ── Color palette ─────────────────────────────────────────────────────────────
const LABEL_COLORS = [
    { key: 'red',    hex: '#ef4444' },
    { key: 'orange', hex: '#f97316' },
    { key: 'yellow', hex: '#eab308' },
    { key: 'green',  hex: '#22c55e' },
    { key: 'cyan',   hex: '#06b6d4' },
    { key: 'blue',   hex: '#3b82f6' },
    { key: 'purple', hex: '#a855f7' },
    { key: 'pink',   hex: '#ec4899' },
];

// ── Storage helpers ───────────────────────────────────────────────────────────
function loadNames()       { try { return JSON.parse(localStorage.getItem(RENAME_LS_KEY) || '{}');        } catch { return {}; } }
function loadPins()        { try { return JSON.parse(localStorage.getItem(PIN_LS_KEY) || '[]');           } catch { return []; } }
function loadColors()      { try { return JSON.parse(localStorage.getItem(COLOR_LS_KEY) || '{}');         } catch { return {}; } }
function loadFolders()     { try { return JSON.parse(localStorage.getItem(FOLDERS_LS_KEY) || '[]');       } catch { return []; } }
function loadFolderItems() { try { return JSON.parse(localStorage.getItem(FOLDER_ITEMS_LS_KEY) || '{}'); } catch { return {}; } }

function saveName(convId, name) {
    const m = loadNames();
    if (name) m[convId] = name; else delete m[convId];
    localStorage.setItem(RENAME_LS_KEY, JSON.stringify(m));
}

function togglePin(convId) {
    const pins = loadPins(), idx = pins.indexOf(convId);
    if (idx === -1) pins.unshift(convId); else pins.splice(idx, 1);
    localStorage.setItem(PIN_LS_KEY, JSON.stringify(pins));
    return idx === -1;
}

function setColor(convId, colorKey) {
    const m = loadColors();
    if (colorKey) m[convId] = colorKey; else delete m[convId];
    localStorage.setItem(COLOR_LS_KEY, JSON.stringify(m));
}

function saveFoldersList(folders) {
    localStorage.setItem(FOLDERS_LS_KEY, JSON.stringify(folders));
}

function setFolderItem(convId, folderId) {
    const m = loadFolderItems();
    if (folderId) m[convId] = folderId; else delete m[convId];
    localStorage.setItem(FOLDER_ITEMS_LS_KEY, JSON.stringify(m));
}

function createFolder(name) {
    const folders = loadFolders();
    const id = 'f_' + Date.now();
    folders.push({ id, name, open: true });
    saveFoldersList(folders);
    return id;
}

function renameFolder(folderId, newName) {
    const folders = loadFolders();
    const f = folders.find(x => x.id === folderId);
    if (f) { f.name = newName; saveFoldersList(folders); }
}

function deleteFolder(folderId) {
    saveFoldersList(loadFolders().filter(f => f.id !== folderId));
    const items = loadFolderItems();
    Object.keys(items).forEach(cid => { if (items[cid] === folderId) delete items[cid]; });
    localStorage.setItem(FOLDER_ITEMS_LS_KEY, JSON.stringify(items));
}

function toggleFolderOpen(folderId) {
    const folders = loadFolders();
    const f = folders.find(x => x.id === folderId);
    if (f) { f.open = !f.open; saveFoldersList(folders); return f.open; }
    return true;
}

function getConvId(anchor) {
    const m = (anchor.getAttribute('href') || '').match(/^\/c\/([a-f0-9-]+)$/i);
    return m ? m[1] : null;
}

// ── Fresh DOM query ───────────────────────────────────────────────────────────
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
        /* ── Context menu items ── */
        .af-ca-item {
            position: relative; display: flex; cursor: pointer; user-select: none;
            align-items: center; gap: 8px; border-radius: 4px; padding: 6px 8px;
            font-size: 12px; outline: none; width: 100%; background: transparent;
            border: none; color: inherit; font-family: inherit; text-align: left;
            white-space: nowrap; box-sizing: border-box; transition: background 0.08s;
        }
        .af-ca-item:hover, .af-ca-item:focus {
            background: hsl(var(--surface-tertiary, 240 4% 16%)); outline: none;
        }
        .af-ca-item svg { width: 14px; height: 14px; flex-shrink: 0; }
        .af-ca-item.af-ca-pin-active { color: hsl(var(--interactive-cta, 230 80% 62%)); }
        .af-ca-divider { height: 1px; background: hsl(var(--border-medium, 240 4% 18%)); margin: 3px 0; }

        /* ── Color accent bar on conversation anchor ── */
        .af-ca-color-bar {
            position: absolute; left: 0; top: 4px; bottom: 4px; width: 3px;
            border-radius: 0 2px 2px 0; pointer-events: none; z-index: 2;
            transition: opacity 0.15s;
        }

        /* ── Color dot (inline next to title) ── */
        .af-ca-color-dot {
            display: hidden;
        }

        /* ── Pin dot ── */
        .af-ca-pin-dot {
            display: inline-flex; align-items: center; justify-content: center;
            width: 16px; height: 16px; flex-shrink: 0;
            color: hsl(var(--interactive-cta, 230 80% 62%)); opacity: 0.65;
        }
        .af-ca-pin-dot svg { width: 10px; height: 10px; }

        /* ── Sidebar section headers ── */
        .af-ca-pinned-header {
            display: flex; align-items: center; gap: 6px; font-size: 11px;
            font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase;
            color: hsl(var(--text-tertiary, 210 10% 38%));
            padding: 8px 10px 4px; font-family: 'Inter', sans-serif;
        }
        .af-ca-pinned-header svg { width: 10px; height: 10px; opacity: 0.55; }
        .af-ca-pinned-divider { height: 1px; background: rgba(255,255,255,0.05); margin: 6px 10px 8px; }

        /* ── Folder section ── */
        .af-ca-folder-section { margin-bottom: 2px; }

        .af-ca-folder-header {
            display: flex; align-items: center; justify-content: space-between;
            gap: 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.07em;
            text-transform: uppercase; color: hsl(var(--text-tertiary, 210 10% 38%));
            padding: 6px 8px 4px; font-family: 'Inter', sans-serif;
            border-radius: 5px; cursor: pointer; user-select: none;
            transition: background 0.1s;
        }
        .af-ca-folder-header:hover { background: rgba(255,255,255,0.03); }
        .af-ca-folder-header-left { display: flex; align-items: center; gap: 6px; }
        .af-ca-folder-header-right { display: flex; align-items: center; gap: 5px; opacity: 0; transition: opacity 0.12s; }
        .af-ca-folder-section:hover .af-ca-folder-header-right { opacity: 1; }
        .af-ca-folder-header svg.hdr-icon { width: 10px; height: 10px; opacity: 0.55; }

        .af-ca-folder-chevron {
            display: inline-flex; align-items: center; justify-content: center;
            transition: transform 0.18s ease; opacity: 0.35;
        }
        .af-ca-folder-chevron svg { width: 9px; height: 9px; }
        .af-ca-folder-chevron.open { transform: rotate(90deg); }

        .af-ca-folder-count {
            font-size: 9.5px; font-weight: 600; padding: 1px 5px; border-radius: 20px;
            background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.22);
            font-family: 'Inter', sans-serif; letter-spacing: 0; text-transform: none;
        }

        .af-ca-folder-btn {
            width: 18px; height: 18px; border-radius: 3px; border: none;
            background: transparent; cursor: pointer; display: inline-flex;
            align-items: center; justify-content: center; padding: 0;
            color: rgba(255,255,255,0.3); transition: background 0.1s, color 0.1s;
        }
        .af-ca-folder-btn:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); }
        .af-ca-folder-btn.del:hover { background: rgba(239,68,68,0.12); color: #ef4444; }
        .af-ca-folder-btn svg { width: 10px; height: 10px; pointer-events: none; }

        .af-ca-folder-body { overflow: hidden; }
        .af-ca-folder-body.collapsed { display: none; }
        .af-ca-folder-divider { height: 1px; background: rgba(255,255,255,0.04); margin: 4px 8px 8px; }

        /* ── Named marker ── */
        [data-af-conv-named="true"] { font-style: normal !important; }

        /* ── Flash ── */
        @keyframes af-ca-flash { from { opacity: 0.35; } to { opacity: 1; } }
        .af-ca-flash { animation: af-ca-flash 0.22s ease forwards; }

        /* ══════════════════════════════════════════════════════
           MODAL SYSTEM
        ══════════════════════════════════════════════════════ */
        .af-modal-overlay {
            position: fixed; inset: 0; z-index: 99999; display: flex;
            align-items: center; justify-content: center;
            background: rgba(0,0,0,0.55); backdrop-filter: blur(3px);
            -webkit-backdrop-filter: blur(3px); animation: af-modal-fadein 0.13s ease;
        }
        .af-modal {
            background: hsl(var(--surface-secondary, 240 4% 12%));
            border: 1px solid hsl(var(--border-medium, 240 4% 22%));
            border-radius: 12px; padding: 22px 24px 18px;
            width: min(400px, calc(100vw - 40px)); display: flex;
            flex-direction: column; gap: 14px;
            font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
            box-shadow: 0 0 0 1px rgba(255,255,255,0.04) inset,
                        0 20px 60px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.35);
            animation: af-modal-slidein 0.18s cubic-bezier(0.34,1.2,0.64,1);
        }
        .af-modal-sm { width: min(320px, calc(100vw - 40px)); }
        .af-modal-header {
            display: flex; align-items: center; gap: 9px; font-size: 14px; font-weight: 600;
            color: hsl(var(--text-primary, 210 20% 96%)); line-height: 1.3;
        }
        .af-modal-header svg { width: 15px; height: 15px; flex-shrink: 0; opacity: 0.7; }
        .af-modal-input {
            width: 100%; box-sizing: border-box;
            background: hsl(var(--surface-primary, 240 4% 7%));
            border: 1.5px solid hsl(var(--border-medium, 240 4% 22%));
            border-radius: 8px; color: hsl(var(--text-primary, 210 20% 96%));
            font-size: 13.5px; font-family: inherit; padding: 9px 11px; outline: none;
            transition: border-color 0.15s, box-shadow 0.15s;
            caret-color: hsl(var(--interactive-cta, 230 80% 62%));
        }
        .af-modal-input:focus {
            border-color: hsl(var(--interactive-cta, 230 80% 62%));
            box-shadow: 0 0 0 3px hsla(230,80%,62%,0.18);
        }
        .af-modal-input::placeholder { color: hsl(var(--text-tertiary, 210 10% 42%)); }
        .af-modal-hint {
            font-size: 11px; color: hsl(var(--text-tertiary, 210 10% 38%));
            margin-top: -6px;
        }
        .af-modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 2px; }
        .af-modal-btn {
            padding: 7px 16px; border-radius: 7px; font-size: 13px; font-weight: 500;
            font-family: inherit; cursor: pointer; border: 1.5px solid transparent; outline: none;
            line-height: 1.45; transition: background 0.1s, border-color 0.1s, opacity 0.1s, box-shadow 0.1s;
        }
        .af-modal-btn:focus-visible { box-shadow: 0 0 0 2px hsl(var(--interactive-cta, 230 80% 62%)); }
        .af-modal-cancel {
            background: transparent; border-color: hsl(var(--border-medium, 240 4% 24%));
            color: hsl(var(--text-secondary, 210 10% 68%));
        }
        .af-modal-cancel:hover { background: hsl(var(--surface-tertiary, 240 4% 18%)); color: hsl(var(--text-primary, 210 20% 96%)); }
        .af-modal-confirm { background: hsl(var(--interactive-cta, 230 80% 62%)); border-color: transparent; color: #000; }
        .af-modal-confirm:hover { opacity: 0.86; }
        .af-modal-confirm:active { opacity: 0.72; }
        @keyframes af-modal-fadein { from { opacity: 0; } to { opacity: 1; } }
        @keyframes af-modal-slidein { from { opacity: 0; transform: scale(0.94) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }

        /* ── Color picker modal ── */
        .af-color-row {
            display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 2px 0;
        }
        .af-color-swatch {
            width: 30px; height: 30px; border-radius: 50%; cursor: pointer;
            border: 3px solid transparent; transition: transform 0.14s, border-color 0.14s;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4); flex-shrink: 0;
        }
        .af-color-swatch:hover { transform: scale(1.18); }
        .af-color-swatch.af-selected { border-color: #fff; transform: scale(1.12); }
        .af-color-none {
            width: 30px; height: 30px; border-radius: 50%;
            border: 2px dashed rgba(255,255,255,0.18); cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            color: rgba(255,255,255,0.25); font-size: 16px; flex-shrink: 0;
            transition: border-color 0.14s, color 0.14s;
        }
        .af-color-none:hover { border-color: rgba(255,255,255,0.45); color: rgba(255,255,255,0.6); }

        /* ── Folder picker modal ── */
        .af-folder-list {
            display: flex; flex-direction: column; gap: 4px;
            max-height: 180px; overflow-y: auto;
            scrollbar-width: thin; scrollbar-color: #333 transparent;
        }
        .af-folder-option {
            display: flex; align-items: center; gap: 10px; padding: 8px 11px;
            border-radius: 7px; border: 1.5px solid rgba(255,255,255,0.05); cursor: pointer;
            background: hsl(var(--surface-primary, 240 4% 7%));
            color: hsl(var(--text-secondary, 210 10% 68%)); transition: all 0.12s;
        }
        .af-folder-option:hover {
            border-color: rgba(255,255,255,0.1); color: hsl(var(--text-primary, 210 20% 96%));
        }
        .af-folder-option.af-selected {
            border-color: hsl(var(--interactive-cta, 230 80% 62%));
            background: hsla(230,80%,62%,0.09); color: hsl(var(--text-primary, 210 20% 96%));
        }
        .af-folder-option svg { width: 13px; height: 13px; flex-shrink: 0; opacity: 0.55; }
        .af-folder-option-name { flex: 1; font-size: 13px; font-weight: 500; }
        .af-folder-option-count { font-size: 10px; color: rgba(255,255,255,0.22); }

        .af-folder-new-row {
            display: flex; align-items: center; gap: 8px; padding-top: 4px;
            border-top: 1px solid rgba(255,255,255,0.05); margin-top: 2px;
        }
        .af-folder-new-input {
            flex: 1; background: hsl(var(--surface-primary, 240 4% 7%));
            border: 1.5px solid hsl(var(--border-medium, 240 4% 22%)); border-radius: 7px;
            color: hsl(var(--text-primary, 210 20% 96%)); font-size: 12.5px;
            font-family: inherit; padding: 7px 10px; outline: none; transition: border-color 0.15s;
        }
        .af-folder-new-input:focus { border-color: hsl(var(--interactive-cta, 230 80% 62%)); }
        .af-folder-new-input::placeholder { color: hsl(var(--text-tertiary, 210 10% 42%)); }
        .af-folder-create-btn {
            padding: 7px 12px; border-radius: 7px; font-size: 12px; font-weight: 500;
            font-family: inherit; cursor: pointer; white-space: nowrap;
            border: 1.5px solid rgba(255,255,255,0.1); background: transparent;
            color: rgba(255,255,255,0.5); transition: all 0.12s;
        }
        .af-folder-create-btn:hover {
            border-color: rgba(255,255,255,0.28); color: rgba(255,255,255,0.85);
        }
        .af-remove-from-folder {
            font-size: 11px; text-align: center; cursor: pointer; padding: 3px 0;
            color: rgba(255,255,255,0.28); transition: color 0.12s;
        }
        .af-remove-from-folder:hover { color: #ef4444; }

        /* ── Copy feedback toast ── */
        .af-ca-toast {
            position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
            background: #1a1a1c; border: 1px solid rgba(255,255,255,0.12);
            border-radius: 8px; padding: 9px 16px; font-size: 12.5px;
            color: rgba(255,255,255,0.85); font-family: 'Inter', sans-serif;
            z-index: 99998; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
            display: flex; align-items: center; gap: 8px;
            animation: af-toast-in 0.2s cubic-bezier(0.16,1,0.3,1);
        }
        .af-ca-toast svg { width: 13px; height: 13px; color: #22c55e; flex-shrink: 0; }
        @keyframes af-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
    `;
    document.head.appendChild(s);
}

// ── SVG icons ─────────────────────────────────────────────────────────────────
const SVG_PIN      = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg>`;
const SVG_UNPIN    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="22" y2="22"/><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12"/></svg>`;
const SVG_RENAME   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const SVG_COLOR    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>`;
const SVG_FOLDER   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
const SVG_LINK     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
const SVG_PIN_SM   = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg>`;
const SVG_EDIT_SM  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const SVG_TRASH_SM = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>`;
const SVG_CHEVRON  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;
const SVG_CHECK    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(message) {
    document.querySelector('.af-ca-toast')?.remove();
    const t = document.createElement('div');
    t.className = 'af-ca-toast';
    t.innerHTML = SVG_CHECK + `<span>${message}</span>`;
    document.body.appendChild(t);
    setTimeout(() => {
        t.style.transition = 'opacity 0.25s ease';
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 300);
    }, 2000);
}

// ── Track which list-item triggered the menu ───────────────────────────────────
function trackActiveLi() {
    document.addEventListener('mousedown', e => {
        const btn = e.target.closest('button[data-sidebar="menu-action"]');
        if (!btn) return;
        const li = btn.closest('[data-sidebar="menu-item"]');
        if (li && !li.getAttribute('data-af-ca-pinned-clone') && !li.getAttribute('data-af-ca-folder-clone')) {
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
        if (li && !li.getAttribute('data-af-ca-pinned-clone') && !li.getAttribute('data-af-ca-folder-clone')) return li;
    }
    return _lastActiveLi || null;
}

// ── Generic modal factory ─────────────────────────────────────────────────────
function createOverlay(onCancel) {
    if (_activeModal) return null;
    const overlay = document.createElement('div');
    overlay.className = 'af-modal-overlay';
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) onCancel(); });
    document.body.appendChild(overlay);
    _activeModal = overlay;
    return overlay;
}

function destroyModal() {
    if (!_activeModal) return;
    _activeModal.remove();
    _activeModal = null;
}

// ── MODAL: Rename ─────────────────────────────────────────────────────────────
function showRenameModal(convId) {
    if (_activeModal) return;

    const names    = loadNames();
    const els      = queryConvElements(convId);
    const origTitle = els?.titleSpan?.getAttribute('data-af-orig-title')
                   || els?.titleSpan?.textContent?.trim() || '';
    const current  = names[convId] || origTitle;

    const overlay = createOverlay(cancel);
    if (!overlay) return;

    const dialog = document.createElement('div');
    dialog.className = 'af-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Rename Conversation');

    const header = document.createElement('div');
    header.className = 'af-modal-header';
    header.innerHTML = SVG_RENAME + '<span>Rename Conversation</span>';

    const input = document.createElement('input');
    input.type = 'text'; input.className = 'af-modal-input'; input.value = current;
    input.maxLength = 120; input.setAttribute('autocomplete', 'off'); input.setAttribute('spellcheck', 'false');
    input.placeholder = 'Enter a name for this conversation…';

    const hint = document.createElement('div');
    hint.className = 'af-modal-hint'; hint.textContent = 'Enter to save · Esc to cancel';

    const footer = document.createElement('div'); footer.className = 'af-modal-footer';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'af-modal-btn af-modal-cancel'; cancelBtn.textContent = 'Cancel';
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button'; confirmBtn.className = 'af-modal-btn af-modal-confirm'; confirmBtn.textContent = 'Rename';

    footer.append(cancelBtn, confirmBtn);
    dialog.append(header, input, hint, footer);
    overlay.appendChild(dialog);
    requestAnimationFrame(() => { input.focus(); input.select(); });

    function cancel() { destroyModal(); }

    function confirm() {
        const newName = input.value.trim() || null;
        saveName(convId, newName);
        destroyModal();
        requestAnimationFrame(() => {
            const freshEls = queryConvElements(convId);
            if (freshEls) {
                const orig = freshEls.titleSpan.getAttribute('data-af-orig-title') || origTitle;
                applyToSpan(freshEls.titleSpan, newName, orig);
            }
            rebuildSidebarSections();
        });
    }

    confirmBtn.addEventListener('click', confirm);
    cancelBtn.addEventListener('click', cancel);
    input.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter')  { e.preventDefault(); confirm(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    dialog.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); cancel(); return; }
        if (e.key !== 'Tab') return;
        const focusable = [input, cancelBtn, confirmBtn];
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
}

// ── MODAL: Color Label ────────────────────────────────────────────────────────
function showColorModal(convId) {
    if (_activeModal) return;

    const colors = loadColors();
    let selected = colors[convId] || null;

    const overlay = createOverlay(cancel);
    if (!overlay) return;

    const dialog = document.createElement('div');
    dialog.className = 'af-modal af-modal-sm';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Color Label');

    const header = document.createElement('div');
    header.className = 'af-modal-header';
    header.innerHTML = SVG_COLOR + '<span>Color Label</span>';

    const row = document.createElement('div');
    row.className = 'af-color-row';

    // "None" option
    const noneEl = document.createElement('div');
    noneEl.className = 'af-color-none'; noneEl.title = 'None'; noneEl.textContent = '×';
    noneEl.addEventListener('click', () => { selected = null; refreshSwatches(); });
    row.appendChild(noneEl);

    LABEL_COLORS.forEach(({ key, hex }) => {
        const sw = document.createElement('div');
        sw.className = 'af-color-swatch' + (key === selected ? ' af-selected' : '');
        sw.style.background = hex; sw.title = key.charAt(0).toUpperCase() + key.slice(1);
        sw.dataset.key = key;
        sw.addEventListener('click', () => { selected = key; refreshSwatches(); });
        row.appendChild(sw);
    });

    function refreshSwatches() {
        row.querySelectorAll('.af-color-swatch').forEach(sw => {
            sw.classList.toggle('af-selected', sw.dataset.key === selected);
        });
    }

    const footer = document.createElement('div'); footer.className = 'af-modal-footer';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'af-modal-btn af-modal-cancel'; cancelBtn.textContent = 'Cancel';
    const applyBtn = document.createElement('button');
    applyBtn.type = 'button'; applyBtn.className = 'af-modal-btn af-modal-confirm'; applyBtn.textContent = 'Apply';

    footer.append(cancelBtn, applyBtn);
    dialog.append(header, row, footer);
    overlay.appendChild(dialog);

    function cancel() { destroyModal(); }

    function applyColor() {
        setColor(convId, selected);
        destroyModal();
        requestAnimationFrame(() => {
            syncColorDot(convId);
            rebuildSidebarSections();
        });
    }

    applyBtn.addEventListener('click', applyColor);
    cancelBtn.addEventListener('click', cancel);
    dialog.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        if (e.key === 'Enter')  { e.preventDefault(); applyColor(); }
    });
    requestAnimationFrame(() => applyBtn.focus());
}

// ── MODAL: Move to Folder ─────────────────────────────────────────────────────
function showFolderModal(convId) {
    if (_activeModal) return;

    const folderItems = loadFolderItems();
    let selectedFolderId = folderItems[convId] || null;

    const overlay = createOverlay(cancel);
    if (!overlay) return;

    const dialog = document.createElement('div');
    dialog.className = 'af-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Move to Folder');

    const header = document.createElement('div');
    header.className = 'af-modal-header';
    header.innerHTML = SVG_FOLDER + '<span>Move to Folder</span>';

    // Folder list
    const listEl = document.createElement('div');
    listEl.className = 'af-folder-list';

    function renderFolderList() {
        listEl.innerHTML = '';
        const folders = loadFolders();
        const items   = loadFolderItems();

        if (!folders.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.3);text-align:center;padding:12px 0;';
            empty.textContent = 'No folders yet — create one below.';
            listEl.appendChild(empty);
            return;
        }

        folders.forEach(f => {
            const count = Object.values(items).filter(fid => fid === f.id).length;
            const opt   = document.createElement('div');
            opt.className = 'af-folder-option' + (f.id === selectedFolderId ? ' af-selected' : '');
            opt.innerHTML = SVG_FOLDER +
                `<span class="af-folder-option-name">${escHtml(f.name)}</span>` +
                `<span class="af-folder-option-count">${count}</span>`;
            opt.addEventListener('click', () => {
                selectedFolderId = (selectedFolderId === f.id) ? null : f.id;
                listEl.querySelectorAll('.af-folder-option').forEach(el => {
                    el.classList.toggle('af-selected', el.dataset.fid === selectedFolderId);
                });
            });
            opt.dataset.fid = f.id;
            listEl.appendChild(opt);
        });
    }
    renderFolderList();

    // Remove from folder link
    const removeLink = document.createElement('div');
    removeLink.className = 'af-remove-from-folder';
    removeLink.textContent = 'Remove from folder';
    removeLink.style.display = selectedFolderId ? '' : 'none';
    removeLink.addEventListener('click', () => { selectedFolderId = null; renderFolderList(); removeLink.style.display = 'none'; });

    // New folder row
    const newRow = document.createElement('div'); newRow.className = 'af-folder-new-row';
    const newInput = document.createElement('input');
    newInput.type = 'text'; newInput.className = 'af-folder-new-input'; newInput.maxLength = 60;
    newInput.placeholder = 'New folder name…'; newInput.setAttribute('autocomplete', 'off');
    const createBtn = document.createElement('button');
    createBtn.type = 'button'; createBtn.className = 'af-folder-create-btn'; createBtn.textContent = '+ Create';

    function doCreate() {
        const name = newInput.value.trim();
        if (!name) return;
        const id = createFolder(name);
        selectedFolderId = id;
        newInput.value = '';
        renderFolderList();
        removeLink.style.display = 'none';
    }

    createBtn.addEventListener('click', doCreate);
    newInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); doCreate(); }
        e.stopPropagation();
    });
    newRow.append(newInput, createBtn);

    const footer = document.createElement('div'); footer.className = 'af-modal-footer';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'af-modal-btn af-modal-cancel'; cancelBtn.textContent = 'Cancel';
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button'; confirmBtn.className = 'af-modal-btn af-modal-confirm'; confirmBtn.textContent = 'Move';

    footer.append(cancelBtn, confirmBtn);
    dialog.append(header, listEl, removeLink, newRow, footer);
    overlay.appendChild(dialog);

    function cancel() { destroyModal(); }

    function doMove() {
        setFolderItem(convId, selectedFolderId);
        destroyModal();
        requestAnimationFrame(() => rebuildSidebarSections());
    }

    confirmBtn.addEventListener('click', doMove);
    cancelBtn.addEventListener('click', cancel);
    dialog.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    requestAnimationFrame(() => confirmBtn.focus());
}

// ── MODAL: Rename Folder ──────────────────────────────────────────────────────
function showRenameFolderModal(folderId, currentName) {
    if (_activeModal) return;

    const overlay = createOverlay(cancel);
    if (!overlay) return;

    const dialog = document.createElement('div');
    dialog.className = 'af-modal af-modal-sm';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const header = document.createElement('div');
    header.className = 'af-modal-header';
    header.innerHTML = SVG_EDIT_SM + '<span>Rename Folder</span>';

    const input = document.createElement('input');
    input.type = 'text'; input.className = 'af-modal-input'; input.value = currentName;
    input.maxLength = 60; input.setAttribute('autocomplete', 'off');
    input.placeholder = 'Folder name…';

    const footer = document.createElement('div'); footer.className = 'af-modal-footer';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'af-modal-btn af-modal-cancel'; cancelBtn.textContent = 'Cancel';
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button'; confirmBtn.className = 'af-modal-btn af-modal-confirm'; confirmBtn.textContent = 'Rename';

    footer.append(cancelBtn, confirmBtn);
    dialog.append(header, input, footer);
    overlay.appendChild(dialog);
    requestAnimationFrame(() => { input.focus(); input.select(); });

    function cancel() { destroyModal(); }
    function confirm() {
        const name = input.value.trim();
        if (name) { renameFolder(folderId, name); destroyModal(); requestAnimationFrame(() => rebuildSidebarSections()); }
    }

    confirmBtn.addEventListener('click', confirm);
    cancelBtn.addEventListener('click', cancel);
    input.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter')  { e.preventDefault(); confirm(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
}

// ── escHtml ───────────────────────────────────────────────────────────────────
function escHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Context menu injection ────────────────────────────────────────────────────
function makeMenuItem(icon, label, onMouseDown, extraClass = '') {
    const el = document.createElement('div');
    el.setAttribute('role', 'menuitem'); el.setAttribute('tabindex', '-1');
    el.setAttribute('data-orientation', 'vertical');
    el.setAttribute('data-radix-collection-item', '');
    el.className = 'af-ca-item' + (extraClass ? ' ' + extraClass : '');
    el.innerHTML = icon + `<span>${label}</span>`;
    el.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); onMouseDown(); });
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

    const pins = loadPins();
    const isPinned = pins.includes(convId);

    // ── Pin / Unpin ──
    const pinItem = makeMenuItem(
        isPinned ? SVG_UNPIN : SVG_PIN,
        isPinned ? 'Unpin' : 'Pin',
        () => {
            const els = queryConvElements(convId);
            const targetLi = els ? els.li : li;
            const nowPinned = togglePin(convId);
            syncPinDot(targetLi, convId, nowPinned);
            rebuildSidebarSections();
        },
        isPinned ? 'af-ca-pin-active' : ''
    );

    // ── Rename ──
    const renameItem = makeMenuItem(SVG_RENAME, 'Rename', () => {
        requestAnimationFrame(() => showRenameModal(convId));
    });

    // ── Color Label ──
    const colorItem = makeMenuItem(SVG_COLOR, 'Color Label', () => {
        requestAnimationFrame(() => showColorModal(convId));
    });

    // ── Move to Folder ──
    const folderItem = makeMenuItem(SVG_FOLDER, 'Move to Folder', () => {
        requestAnimationFrame(() => showFolderModal(convId));
    });

    // ── Copy Link ──
    const copyLinkItem = makeMenuItem(SVG_LINK, 'Copy Link', () => {
        const url = `${location.origin}/c/${convId}`;
        navigator.clipboard.writeText(url).then(() => showToast('Link copied!')).catch(() => {});
    });

    // ── Divider ──
    const divider = document.createElement('div');
    divider.className = 'af-ca-divider'; divider.setAttribute('role', 'separator');

    // Insert before Archive
    menuEl.insertBefore(divider,      archiveItem);
    menuEl.insertBefore(copyLinkItem, divider);
    menuEl.insertBefore(folderItem,   copyLinkItem);
    menuEl.insertBefore(colorItem,    folderItem);
    menuEl.insertBefore(renameItem,   colorItem);
    menuEl.insertBefore(pinItem,      renameItem);
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
        dot.className = 'af-ca-pin-dot'; dot.innerHTML = SVG_PIN_SM;
        const iconDiv = anchor.querySelector('div');
        if (iconDiv) iconDiv.after(dot); else anchor.insertBefore(dot, anchor.firstChild);
    } else if (!isPinned && dot) { dot.remove(); }
}

// ── Color dot / bar ───────────────────────────────────────────────────────────
function syncColorDot(convId) {
    const els = queryConvElements(convId);
    if (!els) return;
    applyColorIndicator(els.li, convId);
}

function applyColorIndicator(li, convId) {
    if (!li) return;
    const anchor = li.querySelector('a[href^="/c/"]');
    if (!anchor) return;

    // Remove existing bar
    anchor.querySelectorAll('.af-ca-color-bar').forEach(b => b.remove());
    li.querySelectorAll('.af-ca-color-dot').forEach(d => d.remove());

    const colorKey = loadColors()[convId];
    if (!colorKey) return;

    const color = LABEL_COLORS.find(c => c.key === colorKey);
    if (!color) return;

    // Left accent bar on the anchor
    anchor.style.position = 'relative';
    const bar = document.createElement('span');
    bar.className = 'af-ca-color-bar';
    bar.style.background = color.hex;
    anchor.insertBefore(bar, anchor.firstChild);

    // Dot in the title area (subtle)
    const titleSpan = anchor.querySelector('span.truncate');
    if (titleSpan && !titleSpan.querySelector('.af-ca-color-dot')) {
        const dot = document.createElement('span');
        dot.className = 'af-ca-color-dot';
        dot.style.background = color.hex;
        titleSpan.insertBefore(dot, titleSpan.firstChild);
    }
}

// ── Sidebar sections (pinned + folders) ───────────────────────────────────────
function rebuildSidebarSections() {
    document.querySelectorAll('[data-af-ca-pinned-section]').forEach(el => el.remove());
    document.querySelectorAll('[data-af-ca-folder-sections]').forEach(el => el.remove());

    const sidebarContent = document.querySelector('[data-sidebar="content"]');
    if (!sidebarContent) return;

    // ── Folder sections ──
    const folders   = loadFolders();
    const items     = loadFolderItems();

    if (folders.length) {
        const folderWrapper = document.createElement('div');
        folderWrapper.setAttribute('data-af-ca-folder-sections', '1');

        folders.forEach(folder => {
            const convIds = Object.entries(items)
                .filter(([, fid]) => fid === folder.id)
                .map(([cid]) => cid);

            // Only render folder if it has at least one visible conversation
            const visibleConvIds = convIds.filter(cid =>
                sidebarContent.querySelector(`a[href="/c/${cid}"][${RENAME_INJECTED}]`)
            );

            const section = document.createElement('div');
            section.className = 'af-ca-folder-section';
            section.setAttribute('data-af-folder-id', folder.id);

            // Folder header
            const hdr = document.createElement('div');
            hdr.className = 'af-ca-folder-header';

            const hdrLeft = document.createElement('div');
            hdrLeft.className = 'af-ca-folder-header-left';

            const chevron = document.createElement('span');
            chevron.className = 'af-ca-folder-chevron' + (folder.open ? ' open' : '');
            chevron.innerHTML = SVG_CHEVRON;

            hdrLeft.innerHTML = `<svg class="hdr-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>` +
                `<span>${escHtml(folder.name)}</span>` +
                `<span class="af-ca-folder-count">${visibleConvIds.length}</span>`;
            hdrLeft.insertBefore(chevron, hdrLeft.firstChild);

            // Folder action buttons (rename + delete)
            const hdrRight = document.createElement('div');
            hdrRight.className = 'af-ca-folder-header-right';

            const editBtn = document.createElement('button');
            editBtn.type = 'button'; editBtn.className = 'af-ca-folder-btn'; editBtn.title = 'Rename folder';
            editBtn.innerHTML = SVG_EDIT_SM;
            editBtn.addEventListener('click', e => {
                e.stopPropagation();
                showRenameFolderModal(folder.id, folder.name);
            });

            const delBtn = document.createElement('button');
            delBtn.type = 'button'; delBtn.className = 'af-ca-folder-btn del'; delBtn.title = 'Delete folder';
            delBtn.innerHTML = SVG_TRASH_SM;
            delBtn.addEventListener('click', e => {
                e.stopPropagation();
                if (confirm(`Delete folder "${folder.name}"? Conversations won't be deleted.`)) {
                    deleteFolder(folder.id);
                    rebuildSidebarSections();
                }
            });

            hdrRight.append(editBtn, delBtn);
            hdr.append(hdrLeft, hdrRight);

            // Toggle collapse on click
            hdr.addEventListener('click', () => {
                const nowOpen = toggleFolderOpen(folder.id);
                chevron.classList.toggle('open', nowOpen);
                body.classList.toggle('collapsed', !nowOpen);
            });

            // Folder body
            const body = document.createElement('div');
            body.className = 'af-ca-folder-body' + (folder.open ? '' : ' collapsed');

            const ul = document.createElement('ul');
            ul.setAttribute('data-sidebar', 'menu');
            ul.className = 'flex w-full min-w-0 flex-col gap-1';

            visibleConvIds.forEach(cid => {
                const origAnchor = sidebarContent.querySelector(`a[href="/c/${cid}"][${RENAME_INJECTED}]`);
                if (!origAnchor) return;
                const origLi = origAnchor.closest('[data-sidebar="menu-item"]');
                if (!origLi) return;

                const clone = origLi.cloneNode(true);
                clone.setAttribute('data-af-ca-folder-clone', '1');
                clone.removeAttribute('style');

                const cloneAnchor = clone.querySelector('a[href^="/c/"]');
                if (cloneAnchor) {
                    cloneAnchor.addEventListener('click', e => { e.preventDefault(); origAnchor.click(); });
                }

                clone.querySelectorAll('[data-sidebar="menu-action"]').forEach(b => b.remove());
                ul.appendChild(clone);
            });

            body.appendChild(ul);
            section.append(hdr, body);

            const divEl = document.createElement('div');
            divEl.className = 'af-ca-folder-divider';
            section.appendChild(divEl);
            folderWrapper.appendChild(section);
        });

        sidebarContent.insertBefore(folderWrapper, sidebarContent.firstChild);
    }

    // ── Pinned section ──
    const pins = loadPins();
    if (!pins.length) return;

    const section = document.createElement('div');
    section.setAttribute('data-af-ca-pinned-section', '1');

    const header = document.createElement('div');
    header.className = 'af-ca-pinned-header';
    header.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg><span>Pinned</span>`;
    section.appendChild(header);

    const ul = document.createElement('ul');
    ul.setAttribute('data-sidebar', 'menu');
    ul.className = 'flex w-full min-w-0 flex-col gap-1';

    let added = 0;
    pins.forEach(convId => {
        const origAnchor = sidebarContent.querySelector(`a[href="/c/${convId}"][${RENAME_INJECTED}]`);
        if (!origAnchor) return;
        const origLi = origAnchor.closest('[data-sidebar="menu-item"]');
        if (!origLi) return;

        const clone = origLi.cloneNode(true);
        clone.setAttribute('data-af-ca-pinned-clone', '1');
        clone.removeAttribute('style');

        const cloneAnchor = clone.querySelector('a[href^="/c/"]');
        if (cloneAnchor) {
            cloneAnchor.addEventListener('click', e => { e.preventDefault(); origAnchor.click(); });
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

    // Insert pinned BEFORE folders
    const folderSections = sidebarContent.querySelector('[data-af-ca-folder-sections]');
    sidebarContent.insertBefore(section, folderSections || sidebarContent.firstChild);
}

// ── Span helpers ──────────────────────────────────────────────────────────────
function applyToSpan(titleSpan, customName, orig) {
    titleSpan.innerHTML = '';
    titleSpan.textContent = customName || orig || '';
    titleSpan.style.fontStyle = '';
    if (customName) {
        titleSpan.setAttribute('data-af-conv-named', 'true');
        titleSpan.classList.add('af-ca-flash');
        titleSpan.addEventListener('animationend', () => titleSpan.classList.remove('af-ca-flash'), { once: true });
    } else { titleSpan.removeAttribute('data-af-conv-named'); }
}

// ── Sidebar item processing ───────────────────────────────────────────────────
function processItem(li) {
    if (li.getAttribute('data-af-ca-pinned-clone') || li.getAttribute('data-af-ca-folder-clone')) return;

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
    applyColorIndicator(li, convId);
}

function processAll() {
    document.querySelectorAll('[data-sidebar="menu-item"]').forEach(li => processItem(li));
}

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
    rebuildSidebarSections();

    if (!renameObserver) {
        let deb = null;
        renameObserver = new MutationObserver(() => {
            if (deb) return;
            deb = setTimeout(() => {
                deb = null;
                processAll();
                reapplyNames();
                const hasPinned  = !!document.querySelector('[data-af-ca-pinned-section]');
                const hasFolders = !!document.querySelector('[data-af-ca-folder-sections]');
                const pins = loadPins(), folders = loadFolders(), items = loadFolderItems();
                const needFolders = folders.some(f =>
                    Object.values(items).some(fid => fid === f.id &&
                        document.querySelector(`a[href^="/c/"]`)
                    )
                );
                if ((!hasPinned && pins.length) || (!hasFolders && needFolders)) {
                    rebuildSidebarSections();
                }
            }, 120);
        });
        renameObserver.observe(document.body, { childList: true, subtree: true });
    }
}

function disableRenameConversations() {
    if (_activeModal) { _activeModal.remove(); _activeModal = null; }
    stopMenuObserver();
    if (renameObserver) { renameObserver.disconnect(); renameObserver = null; }

    document.querySelectorAll('.af-ca-pin-dot').forEach(el => el.remove());
    document.querySelectorAll('.af-ca-color-bar').forEach(el => el.remove());
    document.querySelectorAll('.af-ca-color-dot').forEach(el => el.remove());
    document.querySelectorAll('[data-af-ca-pinned-section]').forEach(el => el.remove());
    document.querySelectorAll('[data-af-ca-folder-sections]').forEach(el => el.remove());

    document.querySelectorAll(`a[href^="/c/"][${RENAME_INJECTED}]`).forEach(anchor => {
        anchor.removeAttribute(RENAME_INJECTED);
        const ts = anchor.querySelector('span.truncate');
        if (ts) { const orig = ts.getAttribute('data-af-orig-title'); if (orig) applyToSpan(ts, null, orig); }
    });

    _lastActiveLi = null;
    document.querySelector('.af-ca-toast')?.remove();
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