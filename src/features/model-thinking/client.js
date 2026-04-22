const MODEL_THINKING_STYLE_ID = 'arena-fixes-model-thinking-style';
const THINKING_BTN_STYLE_ID   = 'arena-fixes-thinking-btn-style';

let modelThinkingEnabled = false;
let thinkingObserver     = null;
let thinkingPromptLevel  = 'medium';
let thinkingBtnObserver  = null;

const convState = {};
const thinkingStartTimes = new WeakMap();

function getConvId() {
    const m = window.location.pathname.match(/\/c\/([a-zA-Z0-9_-]+)/i);
    return m ? m[1] : '__new__';
}

function escHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function setTA(ta, val) {
    const ns = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (ns) ns.call(ta, val); else ta.value = val;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
}

function wordCount(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    return (d.textContent || '').trim().split(/\s+/).filter(Boolean).length;
}

function formatDuration(ms) {
    if (!ms || ms < 0) return null;
    const s = Math.round(ms / 1000);
    if (s < 1) return null;
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

const LEVELS = [
    {
        value:  'minimal',
        label:  'Minimal',
        desc:   'Brief reasoning pass',
        icon: `<svg class="af-think-opt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>`,
        prompt: 'Before answering, briefly think through this problem inside <thinking></thinking> tags.'
    },
    {
        value:  'medium',
        label:  'Standard',
        desc:   'Step-by-step analysis',
        icon: `<svg class="af-think-opt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"/>
        </svg>`,
        prompt: 'Before answering, think through this step by step inside <thinking></thinking> tags, then give your response.'
    },
    {
        value:  'expert',
        label:  'Deep',
        desc:   'Comprehensive reasoning',
        icon: `<svg class="af-think-opt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
            <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
            <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
            <path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/>
            <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/>
            <path d="M3.477 10.896a4 4 0 0 1 .585-.396"/>
            <path d="M19.938 10.5a4 4 0 0 1 .585.396"/>
        </svg>`
    }
];

function getLevel() {
    return LEVELS.find(l => l.value === thinkingPromptLevel) || LEVELS[1];
}

function renderMd(raw) {
    if (!raw?.trim()) return '';

    const stash = [];
    const hold  = s => { const i = stash.length; stash.push(s); return `\x01${i}\x01`; };

    let t = raw.replace(/```([\w-]*)\n?([\s\S]*?)```/g, (_, lang, code) =>
        hold(
            `<div class="af-cb">` +
            `<div class="af-cb-hdr"><span class="af-cb-lang">${escHtml(lang || 'text')}</span></div>` +
            `<pre class="af-cb-pre"><code>${escHtml(code.trim())}</code></pre>` +
            `</div>`
        )
    );

    t = t.replace(/`([^`\n]+)`/g, (_, c) => hold(`<code class="af-ic">${escHtml(c)}</code>`));
    t = t.replace(/^#{1,4} (.+)$/gm, (_, txt) => `<span class="af-hd">${txt}</span>`);
    t = t.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    t = t.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
    t = t.replace(/\*([^*\n]+)\*/g,     '<em>$1</em>');
    t = t.replace(/__(.+?)__/g,         '<strong>$1</strong>');
    t = t.replace(/_([^_\n]+)_/g,       '<em>$1</em>');
    t = t.replace(/^-{3,}$/gm,          '<hr class="af-hr">');
    t = t.replace(/^(&gt;|>) (.+)$/gm,  '<span class="af-bq">$2</span>');

    t = t.replace(/((?:^[ \t]*[-*+] .+(?:\n|$))+)/gm, m => {
        const items = m.trim().split('\n').filter(Boolean)
            .map(l => `<li>${l.replace(/^[ \t]*[-*+] /, '')}</li>`).join('');
        return `<ul class="af-ul">${items}</ul>`;
    });
    t = t.replace(/((?:^[ \t]*\d+\. .+(?:\n|$))+)/gm, m => {
        const items = m.trim().split('\n').filter(Boolean)
            .map(l => `<li>${l.replace(/^[ \t]*\d+\. /, '')}</li>`).join('');
        return `<ol class="af-ol">${items}</ol>`;
    });

    t = t.split(/\n{2,}/).map(block => {
        block = block.trim();
        if (!block) return '';
        if (/^<[uohd]|^<hr|^<span class="af-bq|^\x01/.test(block)) return block;
        return `<p class="af-p">${block.replace(/\n/g, '<br>')}</p>`;
    }).join('');

    stash.forEach((s, i) => { t = t.replaceAll(`\x01${i}\x01`, s); });
    return t;
}

function injectThinkingStyle() {
    if (document.getElementById(MODEL_THINKING_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = MODEL_THINKING_STYLE_ID;
    style.textContent = `

/* ── Thinking Block ─────────────────────────────────── */
.af-thinking-block {
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 6px;
    margin: 8px 0;
    overflow: hidden;
    background: rgba(255,255,255,0.015);
    font-family: 'Inter', system-ui, sans-serif;
    transition: border-color 0.15s;
}
.af-thinking-block:hover { border-color: rgba(255,255,255,0.11); }
.af-thinking-block.af-thinking-streaming { border-color: rgba(255,255,255,0.09); }

.af-thinking-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    text-align: left;
    transition: background 0.12s;
    user-select: none;
    color: rgba(255,255,255,0.32);
}
.af-thinking-toggle:hover {
    background: rgba(255,255,255,0.025);
    color: rgba(255,255,255,0.48);
}
.af-thinking-block.af-thinking-open .af-thinking-toggle {
    border-bottom: 1px solid rgba(255,255,255,0.055);
    color: rgba(255,255,255,0.42);
}

.af-thinking-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: rgba(255,255,255,0.22);
}
.af-thinking-icon svg { width: 13px; height: 13px; display: block; }

.af-thinking-label {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 7px;
}

.af-thinking-title {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.3);
}
.af-thinking-block.af-thinking-open .af-thinking-title { color: rgba(255,255,255,0.45); }

.af-thinking-meta {
    font-size: 10.5px;
    color: rgba(255,255,255,0.18);
    font-weight: 400;
    display: flex;
    align-items: center;
    gap: 4px;
}
.af-thinking-meta-sep {
    width: 2px;
    height: 2px;
    border-radius: 50%;
    background: rgba(255,255,255,0.12);
    display: inline-block;
}

.af-thinking-chevron {
    flex-shrink: 0;
    color: rgba(255,255,255,0.15);
    transition: transform 0.2s cubic-bezier(0.16,1,0.3,1), color 0.12s;
}
.af-thinking-chevron svg { width: 10px; height: 10px; display: block; }
.af-thinking-toggle:hover .af-thinking-chevron { color: rgba(255,255,255,0.28); }
.af-thinking-block.af-thinking-open .af-thinking-chevron { transform: rotate(180deg); }

.af-thinking-content {
    display: none;
    padding: 11px 13px 13px;
    animation: af-think-reveal 0.16s ease;
    font-size: 12.5px;
    line-height: 1.75;
    color: rgba(255,255,255,0.4);
    font-family: 'Inter', system-ui, sans-serif;
}
@keyframes af-think-reveal {
    from { opacity: 0; transform: translateY(-2px); }
    to   { opacity: 1; transform: translateY(0); }
}
.af-thinking-block.af-thinking-open .af-thinking-content { display: block; }

.af-thinking-content p,
.af-thinking-content .af-p { margin: 0 0 8px; color: rgba(255,255,255,0.4); }
.af-thinking-content p:last-child,
.af-thinking-content .af-p:last-child { margin-bottom: 0; }

.af-thinking-content .af-hd,
.af-thinking-content h1,
.af-thinking-content h2,
.af-thinking-content h3,
.af-thinking-content h4 {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: rgba(255,255,255,0.62);
    margin: 12px 0 4px;
}
.af-thinking-content .af-hd:first-child,
.af-thinking-content h1:first-child { margin-top: 0; }

.af-thinking-content strong { color: rgba(255,255,255,0.62); font-weight: 600; }
.af-thinking-content em     { color: rgba(255,255,255,0.48); font-style: italic; }

.af-thinking-content .af-bq {
    display: block;
    border-left: 2px solid rgba(255,255,255,0.1);
    padding: 2px 10px;
    margin: 5px 0;
    color: rgba(255,255,255,0.3);
    font-style: italic;
}

.af-thinking-content ul,
.af-thinking-content ol,
.af-thinking-content .af-ul,
.af-thinking-content .af-ol {
    margin: 4px 0 8px;
    padding-left: 16px;
    color: rgba(255,255,255,0.4);
}
.af-thinking-content li { margin: 2px 0; line-height: 1.65; }
.af-thinking-content ul > li { list-style-type: disc; }
.af-thinking-content ul > li::marker { color: rgba(255,255,255,0.18); }
.af-thinking-content ol > li { list-style-type: decimal; }
.af-thinking-content ol > li::marker { color: rgba(255,255,255,0.18); }

.af-thinking-content code,
.af-thinking-content .af-ic {
    background: rgba(255,255,255,0.055);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 3px;
    padding: 1px 5px;
    font-size: 11.5px;
    font-family: 'SFMono-Regular', Consolas, 'Courier New', monospace;
    color: rgba(255,255,255,0.62);
}

.af-thinking-content .af-cb {
    background: rgba(0,0,0,0.35);
    border: 1px solid rgba(255,255,255,0.055);
    border-radius: 5px;
    overflow: hidden;
    margin: 8px 0;
}
.af-thinking-content .af-cb-hdr {
    display: flex;
    align-items: center;
    padding: 4px 10px;
    background: rgba(255,255,255,0.025);
    border-bottom: 1px solid rgba(255,255,255,0.045);
}
.af-thinking-content .af-cb-lang {
    font-size: 9.5px;
    font-family: 'SFMono-Regular', Consolas, monospace;
    color: rgba(255,255,255,0.22);
    text-transform: uppercase;
    letter-spacing: 0.07em;
}
.af-thinking-content .af-cb-pre {
    display: block;
    padding: 8px 11px;
    margin: 0;
    font-size: 11.5px;
    font-family: 'SFMono-Regular', Consolas, 'Courier New', monospace;
    color: rgba(255,255,255,0.58);
    background: transparent;
    border: none;
    white-space: pre;
    overflow-x: auto;
    line-height: 1.6;
}
.af-thinking-content .af-cb code {
    background: transparent;
    border: none;
    padding: 0;
    border-radius: 0;
    color: inherit;
    font-size: inherit;
}
.af-thinking-content pre {
    background: rgba(0,0,0,0.35);
    border: 1px solid rgba(255,255,255,0.055);
    border-radius: 5px;
    padding: 9px 11px;
    margin: 8px 0;
    overflow-x: auto;
}
.af-thinking-content pre > code {
    background: transparent;
    border: none;
    padding: 0;
    font-size: 11.5px;
    color: rgba(255,255,255,0.58);
    white-space: pre;
}
.af-thinking-content hr,
.af-thinking-content .af-hr {
    border: none;
    border-top: 1px solid rgba(255,255,255,0.055);
    margin: 10px 0;
}

.af-thinking-block.af-thinking-streaming .af-thinking-icon {
    animation: af-pulse-icon 2s ease-in-out infinite;
}
@keyframes af-pulse-icon {
    0%, 100% { opacity: 0.22; }
    50%       { opacity: 0.55; }
}

/* ══════════════════════════════════════
   THINKING PROMPT BUTTON
   — mirrors enhance-prompt.client.js
══════════════════════════════════════ */

.af-think-wrap {
    display: inline-flex;
    align-items: center;
    position: relative;
    flex-shrink: 0;
}

/* Main icon button — exact mirror of .arena-fixes-enhance-btn */
.af-think-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 6px 0 0 6px;
    border: 1px solid hsl(var(--border-faint, 240 5% 22%));
    border-right: none;
    background: transparent;
    color: hsl(var(--text-secondary, 210 10% 55%));
    cursor: pointer;
    transition: color 0.15s ease, background 0.15s ease;
    padding: 0;
    position: relative;
}
.af-think-btn:hover {
    color: hsl(var(--text-primary, 0 0% 92%));
    background: rgba(255,255,255,0.05);
}
.af-think-btn.af-think-active {
    color: hsl(var(--text-primary, 0 0% 92%));
}
.af-think-btn svg {
    width: 15px;
    height: 15px;
    pointer-events: none;
}

/* Tooltip — exact mirror of .af-tooltip */
.af-think-tooltip {
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
.af-think-btn:hover .af-think-tooltip { opacity: 1; }

/* Caret — exact mirror of .af-effort-caret */
.af-think-caret {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 32px;
    border-radius: 0 6px 6px 0;
    border: 1px solid hsl(var(--border-faint, 240 5% 22%));
    background: transparent;
    color: hsl(var(--text-secondary, 210 10% 55%));
    cursor: pointer;
    transition: color 0.15s ease, background 0.15s ease;
    padding: 0;
    flex-shrink: 0;
}
.af-think-caret:hover {
    color: hsl(var(--text-primary, 0 0% 92%));
    background: rgba(255,255,255,0.05);
}
.af-think-caret svg { width: 10px; height: 10px; pointer-events: none; }

/* Dropdown menu — exact mirror of .af-effort-menu */
.af-think-menu {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    min-width: 10.5rem;
    background: #141414;
    border: 1px solid #2a2a2a;
    border-radius: 10px;
    padding: 4px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    z-index: 9999;
    display: none;
    animation: af-think-menu-in 0.15s cubic-bezier(0.16,1,0.3,1);
}
.af-think-menu.af-open { display: block; }
@keyframes af-think-menu-in {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
}

/* Section label — exact mirror of .af-effort-menu-label */
.af-think-menu-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #555;
    padding: 6px 10px 4px;
    font-family: 'Inter', sans-serif;
}

/* Level items — exact mirror of .af-effort-item */
.af-think-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    border-radius: 7px;
    border: none;
    background: transparent;
    color: #888;
    font-size: 13px;
    font-weight: 500;
    font-family: 'Inter', system-ui, sans-serif;
    cursor: pointer;
    transition: background 0.1s ease, color 0.1s ease;
    text-align: left;
}
.af-think-item:hover { background: rgba(255,255,255,0.06); color: #eaeaea; }
.af-think-item.af-sel { background: rgba(255,255,255,0.08); color: #eaeaea; }

.af-think-opt-icon { width: 15px; height: 15px; flex-shrink: 0; }

/* Divider — exact mirror of .af-menu-divider */
.af-think-divider {
    height: 1px;
    background: #222;
    margin: 4px 6px;
}

/* Status row at bottom of menu */
.af-think-status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    border-radius: 7px;
    box-sizing: border-box;
}
.af-think-status-left {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    font-weight: 500;
    font-family: 'Inter', system-ui, sans-serif;
    color: #555;
}
.af-think-status-left svg { width: 15px; height: 15px; flex-shrink: 0; }

.af-think-status-badge {
    font-size: 10px;
    font-weight: 600;
    font-family: 'Inter', sans-serif;
    letter-spacing: 0.05em;
    padding: 2px 7px;
    border-radius: 20px;
    border: 1px solid #2a2a2a;
    background: transparent;
    color: #3a3a3a;
    white-space: nowrap;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.af-think-status-badge.on {
    color: #888;
    border-color: #3a3a3a;
    background: rgba(255,255,255,0.03);
}

/* Flash feedback on double-click */
@keyframes af-think-flash {
    0%, 100% { background: transparent; }
    50%       { background: rgba(255,255,255,0.07); }
}
.af-think-btn.af-think-flash { animation: af-think-flash 0.3s ease 2; }
    `;
    document.head.appendChild(style);
}

function buildBlock(contentHtml, isStreaming, durationMs) {
    const wc  = isStreaming ? null : wordCount(contentHtml);
    const dur = (!isStreaming && durationMs) ? formatDuration(durationMs) : null;

    let metaHtml = '';
    if (isStreaming) {
        metaHtml = `<span class="af-thinking-meta">Thinking…</span>`;
    } else {
        const parts = [];
        if (dur) parts.push(dur);
        if (wc)  parts.push(`${wc} words`);
        if (parts.length) {
            metaHtml = `<span class="af-thinking-meta">` +
                parts.map((p, i) => i > 0
                    ? `<span class="af-thinking-meta-sep"></span>${p}`
                    : p
                ).join('') +
            `</span>`;
        }
    }

    const block = document.createElement('div');
    block.className = 'af-thinking-block' + (isStreaming ? ' af-thinking-streaming' : '');
    block.setAttribute('data-af-thinking-block', '1');

    block.innerHTML = `
        <button class="af-thinking-toggle" type="button" aria-expanded="false">
            <span class="af-thinking-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                     stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
                    <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
                    <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
                </svg>
            </span>
            <span class="af-thinking-label">
                <span class="af-thinking-title">Thinking</span>
                ${metaHtml}
            </span>
            <span class="af-thinking-chevron">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 9l6 6 6-6"/>
                </svg>
            </span>
        </button>
        <div class="af-thinking-content">${contentHtml}</div>
    `;

    const toggle = block.querySelector('.af-thinking-toggle');
    toggle.addEventListener('click', () => {
        const open = block.classList.toggle('af-thinking-open');
        toggle.setAttribute('aria-expanded', String(open));
    });

    return block;
}

function processProse(prose) {
    prose.querySelectorAll('thinking:not([data-af-done])').forEach(el => {
        el.setAttribute('data-af-done', '1');
        const startTime = thinkingStartTimes.get(el);
        const dur = startTime ? Date.now() - startTime : null;
        const block = buildBlock(el.innerHTML.trim(), false, dur);
        el.replaceWith(block);
    });

    const OPEN  = '&lt;thinking&gt;';
    const CLOSE = '&lt;/thinking&gt;';
    let html = prose.innerHTML;
    if (!html.includes(OPEN) || !html.includes(CLOSE)) return;

    const pairs = [];
    let from = 0;
    while (true) {
        const s = html.indexOf(OPEN, from);
        if (s === -1) break;
        const e = html.indexOf(CLOSE, s + OPEN.length);
        if (e === -1) break;
        pairs.push({ s, e: e + CLOSE.length, inner: html.slice(s + OPEN.length, e) });
        from = e + CLOSE.length;
    }
    if (pairs.length === 0) return;

    let result = html;
    for (let i = pairs.length - 1; i >= 0; i--) {
        const { s, e } = pairs[i];
        result = result.slice(0, s) + `<span data-af-ph="${i}"></span>` + result.slice(e);
    }
    prose.innerHTML = result;

    pairs.forEach(({ inner }, i) => {
        const ph = prose.querySelector(`[data-af-ph="${i}"]`);
        if (!ph) return;
        const tmp = document.createElement('div');
        tmp.innerHTML = inner;
        const raw = tmp.textContent || '';
        const hasMarkdown = /[*_`#\-]|\d+\./.test(raw);
        const rendered = hasMarkdown ? renderMd(raw) : (inner || raw);
        const block = buildBlock(rendered, false, null);
        ph.replaceWith(block);
    });
}

function checkStreaming(prose) {
    const OPEN  = '&lt;thinking&gt;';
    const CLOSE = '&lt;/thinking&gt;';
    const html  = prose.innerHTML;

    if (html.includes(OPEN) && html.includes(CLOSE)) {
        processProse(prose);
        return;
    }

    prose.querySelectorAll('thinking:not([data-af-done])').forEach(el => {
        if (!el.getAttribute('data-af-streaming')) {
            el.setAttribute('data-af-streaming', '1');
            thinkingStartTimes.set(el, Date.now());
        }
    });
}

function scanAll() {
    document.querySelectorAll('.prose').forEach(prose => {
        if (prose.closest('.bg-surface-raised')) return;
        checkStreaming(prose);
    });
}

function enableModelThinking() {
    injectThinkingStyle();
    scanAll();
    if (!thinkingObserver) {
        let db = null;
        thinkingObserver = new MutationObserver(() => {
            if (db) return;
            db = setTimeout(() => { db = null; scanAll(); }, 180);
        });
        thinkingObserver.observe(document.body, {
            childList: true, subtree: true, characterData: true
        });
    }
}

function disableModelThinking() {
    if (thinkingObserver) { thinkingObserver.disconnect(); thinkingObserver = null; }
    document.querySelectorAll('[data-af-thinking-block]').forEach(block => {
        const content = block.querySelector('.af-thinking-content');
        const frag = document.createElement('span');
        frag.innerHTML = content
            ? `&lt;thinking&gt;${content.innerHTML}&lt;/thinking&gt;`
            : '';
        block.replaceWith(frag);
    });
    document.getElementById(MODEL_THINKING_STYLE_ID)?.remove();
}

function openMenu(m)   { m.classList.add('af-open'); }
function closeMenu(m)  { m.classList.remove('af-open'); }
function toggleMenu(m) { m.classList.contains('af-open') ? closeMenu(m) : openMenu(m); }

function syncThinkingUI() {
    const cid   = getConvId();
    const state = convState[cid];
    const sent  = !!state?.sent;
    const activeLvl = LEVELS.find(l => l.value === (state?.level || thinkingPromptLevel)) || getLevel();

    document.querySelectorAll('.af-think-btn').forEach(btn => {
        btn.classList.toggle('af-think-active', sent);
        const tip = btn.querySelector('.af-think-tooltip');
        if (tip) tip.textContent = sent
            ? `Thinking: ${activeLvl.label} (active)`
            : 'Thinking Prompt';
    });

    document.querySelectorAll('.af-think-item').forEach(item => {
        item.classList.toggle('af-sel', item.dataset.value === thinkingPromptLevel);
    });

    document.querySelectorAll('.af-think-status-badge').forEach(badge => {
        badge.classList.toggle('on', sent);
        badge.textContent = sent ? activeLvl.label : 'Off';
    });
}

function setThinkingLevel(value) {
    const cid  = getConvId();
    const prev = thinkingPromptLevel;
    thinkingPromptLevel = value;
    chrome.storage.local.set({ thinkingPromptLevel: value });
    if (prev !== value && convState[cid]?.sent) {
        convState[cid] = { sent: false, level: value };
    }
    syncThinkingUI();
}

function buildThinkingMenu(wrap) {
    const menu = document.createElement('div');
    menu.className = 'af-think-menu';

    const label = document.createElement('div');
    label.className = 'af-think-menu-label';
    label.textContent = 'Reasoning Depth';
    menu.appendChild(label);

    LEVELS.forEach(lvl => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'af-think-item' + (lvl.value === thinkingPromptLevel ? ' af-sel' : '');
        btn.dataset.value = lvl.value;
        btn.innerHTML = lvl.icon + `<span>${lvl.label}</span>`;
        btn.addEventListener('click', e => {
            e.stopPropagation();
            setThinkingLevel(lvl.value);
            closeMenu(menu);
        });
        menu.appendChild(btn);
    });

    menu.appendChild(Object.assign(document.createElement('div'), { className: 'af-think-divider' }));

    const cid   = getConvId();
    const state = convState[cid];
    const sent  = !!state?.sent;
    const activeLvl = LEVELS.find(l => l.value === (state?.level || thinkingPromptLevel)) || getLevel();

    const statusRow = document.createElement('div');
    statusRow.className = 'af-think-status-row';
    statusRow.innerHTML = `
        <span class="af-think-status-left">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                 stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
                <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
                <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
            </svg>
            Status
        </span>
        <span class="af-think-status-badge${sent ? ' on' : ''}">${sent ? activeLvl.label : 'Off'}</span>
    `;
    menu.appendChild(statusRow);

    wrap.appendChild(menu);
    return menu;
}

function buildThinkingButton(textarea) {
    const wrap = document.createElement('div');
    wrap.className = 'af-think-wrap';
    wrap.setAttribute('data-af-think-wrap', '1');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'af-think-btn';

    const cid  = getConvId();
    const sent = !!convState[cid]?.sent;
    if (sent) btn.classList.add('af-think-active');

    btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
             stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
            <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
            <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
            <path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/>
            <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/>
            <path d="M3.477 10.896a4 4 0 0 1 .585-.396"/>
            <path d="M19.938 10.5a4 4 0 0 1 .585.396"/>
        </svg>
        <span class="af-think-tooltip">${sent ? `Thinking: ${getLevel().label} (active)` : 'Thinking Prompt'}</span>
    `;

    const caret = document.createElement('button');
    caret.type = 'button';
    caret.className = 'af-think-caret';
    caret.setAttribute('aria-label', 'Reasoning depth');
    caret.innerHTML = `
        <svg viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5"
             stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 1l4 4 4-4"/>
        </svg>
    `;

    const menu = buildThinkingMenu(wrap);

    btn.addEventListener('click', () => {
        const cid   = getConvId();
        const lvl   = getLevel();
        const state = convState[cid];

        if (state?.sent && state.level === thinkingPromptLevel) {
            btn.classList.add('af-think-flash');
            setTimeout(() => btn.classList.remove('af-think-flash'), 600);
            return;
        }

        const current = textarea.value.trim();
        const newValue = current
            ? `${lvl.prompt}\n\n${current}`
            : lvl.prompt;

        setTA(textarea, newValue);
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = newValue.length;

        convState[cid] = { sent: true, level: thinkingPromptLevel };
        syncThinkingUI();
    });

    caret.addEventListener('click', e => {
        e.stopPropagation();
        syncThinkingUI();
        toggleMenu(menu);
    });

    document.addEventListener('click', e => {
        if (!wrap.contains(e.target)) closeMenu(menu);
    }, true);

    let lastUrl = location.href;
    const urlWatcher = setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            syncThinkingUI();
        }
    }, 800);
    wrap._urlWatcher = urlWatcher;

    wrap.appendChild(btn);
    wrap.appendChild(caret);
    return wrap;
}

function injectThinkingButton() {
    const textareas = document.querySelectorAll(
        "textarea[name='message'], textarea[placeholder*='Ask'], textarea[data-testid='textbox']"
    );
    textareas.forEach(textarea => {
        const form = textarea.closest('form') || textarea.parentNode;
        if (!form || form.querySelector('[data-af-think-wrap]')) return;

        const wrap = buildThinkingButton(textarea);

        const enhanceWrap = form.querySelector('.af-enhance-wrap');
        if (enhanceWrap) {
            enhanceWrap.parentNode.insertBefore(wrap, enhanceWrap);
        } else {
            const submitBtn = form.querySelector(
                "button[type='submit'], button[aria-label*='Send'], button[id*='submit']"
            );
            if (submitBtn?.parentNode) submitBtn.parentNode.insertBefore(wrap, submitBtn);
            else textarea.parentNode?.insertBefore(wrap, textarea.nextSibling);
        }
    });
}

function removeThinkingButton() {
    document.querySelectorAll('[data-af-think-wrap]').forEach(wrap => {
        if (wrap._urlWatcher) clearInterval(wrap._urlWatcher);
        wrap.remove();
    });
}

function enableThinkingButton() {
    injectThinkingButton();
    if (!thinkingBtnObserver) {
        let db = null;
        thinkingBtnObserver = new MutationObserver(() => {
            if (db) return;
            db = setTimeout(() => { db = null; injectThinkingButton(); }, 150);
        });
        thinkingBtnObserver.observe(document.body, { childList: true, subtree: true });
    }
}

function disableThinkingButton() {
    removeThinkingButton();
    if (thinkingBtnObserver) { thinkingBtnObserver.disconnect(); thinkingBtnObserver = null; }
    document.getElementById(THINKING_BTN_STYLE_ID)?.remove();
}

function enable() {
    injectThinkingStyle();
    enableModelThinking();
    enableThinkingButton();
}

function disable() {
    disableModelThinking();
    disableThinkingButton();
}

chrome.storage.local.get(['modelThinkingEnabled', 'thinkingPromptLevel'], data => {
    modelThinkingEnabled = !!data.modelThinkingEnabled;
    thinkingPromptLevel  = data.thinkingPromptLevel || 'medium';
    if (modelThinkingEnabled) enable();
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if ('modelThinkingEnabled' in changes) {
        modelThinkingEnabled = !!changes.modelThinkingEnabled.newValue;
        modelThinkingEnabled ? enable() : disable();
    }
    if ('thinkingPromptLevel' in changes) {
        thinkingPromptLevel = changes.thinkingPromptLevel.newValue || 'medium';
        syncThinkingUI();
    }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'REFRESH_MODEL_THINKING') return;
    chrome.storage.local.get(['modelThinkingEnabled', 'thinkingPromptLevel'], data => {
        modelThinkingEnabled = !!data.modelThinkingEnabled;
        thinkingPromptLevel  = data.thinkingPromptLevel || 'medium';
        modelThinkingEnabled ? enable() : disable();
    });
    sendResponse({ ok: true });
    return true;
});
