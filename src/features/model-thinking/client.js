// Content-script side for Model Thinking.

const MODEL_THINKING_STYLE_ID = 'arena-fixes-model-thinking-style';
const THINKING_BTN_STYLE_ID   = 'arena-fixes-thinking-btn-style';

let modelThinkingEnabled = false;
let thinkingObserver     = null;
let thinkingPromptLevel  = 'medium';
let thinkingBtnObserver  = null;
let _urlWatcher          = null;
let _lastUrl             = location.href;

const convState          = {};
const thinkingStartTimes = new WeakMap();

// ── Helpers ────────────────────────────────────────────────────────────────────

function getThinkingConvId() {
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
    const ns = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype, 'value'
    )?.set;
    if (ns) ns.call(ta, val); else ta.value = val;
    ta.dispatchEvent(new Event('input',  { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
}

function wordCount(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    return (d.textContent || '').trim().split(/\s+/).filter(Boolean).length;
}

function formatDuration(ms) {
    if (!ms || ms < 0) return null;
    const s = Math.round(ms / 1000);
    if (s < 1)  return null;
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60), rem = s % 60;
    return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

// ── Hydration guard ────────────────────────────────────────────────────────────

function waitForHydration(callback, maxWait = 5000) {
    const start = Date.now();
    function check() {
        const settled =
            document.querySelector('#__NEXT_DATA__') ||
            document.querySelector('[data-reactroot]') ||
            Date.now() - start > maxWait;
        if (settled) setTimeout(callback, 300);
        else         setTimeout(check, 100);
    }
    check();
}

// ── Reasoning Levels ───────────────────────────────────────────────────────────

const LEVELS = [
    {
        value: 'minimal',
        label: 'Brief',
        desc:  'Quick reasoning pass',
        icon: `<svg class="af-think-opt-icon" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="1.5"
                    stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>`,
        prompt:
`Before you respond, do a short reasoning pass. \
Write your thinking inside a <thinking> tag like this:

<thinking>
[your reasoning here]
</thinking>

After closing the </thinking> tag, write your actual response.
Important: always close the tag with </thinking> before your response.

`
    },
    {
        value: 'medium',
        label: 'Standard',
        desc:  'Step-by-step analysis',
        icon: `<svg class="af-think-opt-icon" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="1.5"
                    stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189
                     a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0
                     01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25
                     18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0
                     10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"/>
        </svg>`,
        prompt:
`Before answering, reason through this step by step. \
Put your entire reasoning inside a <thinking> tag like this:

<thinking>
[break down the problem]
[consider key factors and edge cases]
[work toward a conclusion]
</thinking>

Then write your final response after the closing </thinking> tag.
Important: do not skip the </thinking> closing tag.

`
    },
    {
        value: 'expert',
        label: 'Deep',
        desc:  'Full chain-of-thought',
        icon: `<svg class="af-think-opt-icon" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="1.5"
                    stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77
                     4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
            <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77
                     4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
            <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
            <path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/>
            <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/>
            <path d="M3.477 10.896a4 4 0 0 1 .585-.396"/>
            <path d="M19.938 10.5a4 4 0 0 1 .585.396"/>
        </svg>`,
        prompt:
`Before responding, work through a thorough reasoning chain. \
Your entire thinking process must be wrapped in a <thinking> tag like this:

<thinking>
[Write your full chain of thought here. Cover:]
[- What is actually being asked, including any implicit requirements]
[- The important factors, constraints, and potential edge cases]
[- Step by step reasoning toward an answer]
[- A check of your logic for errors or gaps]
[- A brief conclusion that leads into your response]
</thinking>

After the </thinking> closing tag, write your final polished response.
Rules: never omit the </thinking> tag. Never put your actual answer inside the thinking block. The thinking block is scratchpad only.

`
    }
];

function getLevel() {
    return LEVELS.find(l => l.value === thinkingPromptLevel) || LEVELS[1];
}

// ── Markdown renderer (complete rewrite) ───────────────────────────────────────
// Processes text in a single linear pass to avoid stash/restore ordering bugs.
// Handles: headings, bold+italic, inline code, fenced code, lists, blockquotes,
// horizontal rules, and paragraphs — all correctly nested.

function renderMd(raw) {
    if (!raw?.trim()) return '';

    const lines  = raw.split('\n');
    const output = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // ── Fenced code block ──────────────────────────────────────────────────
        const fenceMatch = line.match(/^(`{3,})([\w-]*)/);
        if (fenceMatch) {
            const fence   = fenceMatch[1];
            const lang    = fenceMatch[2] || 'text';
            const codeLines = [];
            i++;
            while (i < lines.length && !lines[i].startsWith(fence)) {
                codeLines.push(lines[i]);
                i++;
            }
            i++; // consume closing fence
            output.push(
                `<div class="af-cb">` +
                `<div class="af-cb-hdr">` +
                `<span class="af-cb-lang">${escHtml(lang)}</span>` +
                `</div>` +
                `<pre class="af-cb-pre"><code>${escHtml(codeLines.join('\n'))}</code></pre>` +
                `</div>`
            );
            continue;
        }

        // ── Horizontal rule ────────────────────────────────────────────────────
        if (/^[-*_]{3,}\s*$/.test(line)) {
            output.push('<hr class="af-hr">');
            i++;
            continue;
        }

        // ── ATX Heading (#, ##, ###, ####) ────────────────────────────────────
        const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            const text  = inlineRender(headingMatch[2].trim());
            output.push(`<h${level} class="af-h${level}">${text}</h${level}>`);
            i++;
            continue;
        }

        // ── Blockquote ─────────────────────────────────────────────────────────
        if (/^>\s?/.test(line)) {
            const quoteLines = [];
            while (i < lines.length && /^>\s?/.test(lines[i])) {
                quoteLines.push(lines[i].replace(/^>\s?/, ''));
                i++;
            }
            const inner = renderMd(quoteLines.join('\n'));
            output.push(`<blockquote class="af-bq">${inner}</blockquote>`);
            continue;
        }

        // ── Unordered list ─────────────────────────────────────────────────────
        if (/^[ \t]*[-*+•]\s/.test(line)) {
            const items = [];
            while (i < lines.length && /^[ \t]*[-*+•]\s/.test(lines[i])) {
                items.push(`<li>${inlineRender(lines[i].replace(/^[ \t]*[-*+•]\s/, '').trim())}</li>`);
                i++;
            }
            output.push(`<ul class="af-ul">${items.join('')}</ul>`);
            continue;
        }

        // ── Ordered list ───────────────────────────────────────────────────────
        if (/^[ \t]*\d+\.\s/.test(line)) {
            const items = [];
            while (i < lines.length && /^[ \t]*\d+\.\s/.test(lines[i])) {
                items.push(`<li>${inlineRender(lines[i].replace(/^[ \t]*\d+\.\s/, '').trim())}</li>`);
                i++;
            }
            output.push(`<ol class="af-ol">${items.join('')}</ol>`);
            continue;
        }

        // ── Blank line ─────────────────────────────────────────────────────────
        if (line.trim() === '') {
            i++;
            continue;
        }

        // ── Paragraph ─────────────────────────────────────────────────────────
        // Collect consecutive non-special lines into one paragraph
        const paraLines = [];
        while (
            i < lines.length &&
            lines[i].trim() !== '' &&
            !/^(#{1,4}\s|`{3,}|>\s?|[ \t]*[-*+•]\s|[ \t]*\d+\.\s|[-*_]{3,}\s*$)/.test(lines[i])
        ) {
            paraLines.push(lines[i]);
            i++;
        }
        if (paraLines.length) {
            output.push(`<p class="af-p">${inlineRender(paraLines.join('<br>'))}</p>`);
        }
    }

    return output.join('');
}

// ── Inline renderer ────────────────────────────────────────────────────────────
// Handles bold-italic, bold, italic, inline code, and strikethrough.
// Uses a placeholder system that is strictly index-ordered to avoid
// regex ordering bugs with nested markers.

function inlineRender(text) {
    if (!text) return '';

    const placeholders = [];

    function stash(html) {
        const key = `\x00${placeholders.length}\x00`;
        placeholders.push(html);
        return key;
    }

    // 1. Protect inline code first (highest priority — no formatting inside)
    let t = text.replace(/`([^`]+)`/g, (_, code) =>
        stash(`<code class="af-ic">${escHtml(code)}</code>`)
    );

    // 2. Bold-italic (must come before bold and italic separately)
    t = t.replace(/\*\*\*([^*]+?)\*\*\*/g, (_, inner) =>
        stash(`<strong><em>${inner}</em></strong>`)
    );
    t = t.replace(/___([^_]+?)___/g, (_, inner) =>
        stash(`<strong><em>${inner}</em></strong>`)
    );

    // 3. Bold
    t = t.replace(/\*\*([^*]+?)\*\*/g, (_, inner) =>
        stash(`<strong>${inner}</strong>`)
    );
    t = t.replace(/__([^_]+?)__/g, (_, inner) =>
        stash(`<strong>${inner}</strong>`)
    );

    // 4. Italic
    t = t.replace(/\*([^*\n]+?)\*/g, (_, inner) =>
        stash(`<em>${inner}</em>`)
    );
    t = t.replace(/_([^_\n]+?)_/g, (_, inner) =>
        stash(`<em>${inner}</em>`)
    );

    // 5. Strikethrough
    t = t.replace(/~~([^~]+?)~~/g, (_, inner) =>
        stash(`<del>${inner}</del>`)
    );

    // 6. Restore all placeholders
    t = t.replace(/\x00(\d+)\x00/g, (_, idx) => placeholders[+idx]);

    return t;
}

// ── Style injection ────────────────────────────────────────────────────────────

function injectThinkingStyle() {
    if (document.getElementById(MODEL_THINKING_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = MODEL_THINKING_STYLE_ID;
    style.textContent = `

/* ── Thinking Block ──────────────────────────────────────────── */
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
    display: inline-flex; align-items: center; justify-content: center;
    width: 16px; height: 16px; flex-shrink: 0;
    color: rgba(255,255,255,0.22);
}
.af-thinking-icon svg { width: 13px; height: 13px; display: block; }

.af-thinking-label {
    flex: 1; min-width: 0;
    display: flex; align-items: center; gap: 7px;
}

.af-thinking-title {
    font-size: 11px; font-weight: 500; letter-spacing: 0.02em;
    text-transform: uppercase; color: rgba(255,255,255,0.3);
}
.af-thinking-block.af-thinking-open .af-thinking-title {
    color: rgba(255,255,255,0.45);
}

.af-thinking-meta {
    font-size: 10.5px; color: rgba(255,255,255,0.18);
    font-weight: 400; display: flex; align-items: center; gap: 4px;
}
.af-thinking-meta-sep {
    width: 2px; height: 2px; border-radius: 50%;
    background: rgba(255,255,255,0.12); display: inline-block;
}

.af-thinking-chevron {
    flex-shrink: 0; color: rgba(255,255,255,0.15);
    transition: transform 0.2s cubic-bezier(0.16,1,0.3,1), color 0.12s;
}
.af-thinking-chevron svg { width: 10px; height: 10px; display: block; }
.af-thinking-toggle:hover .af-thinking-chevron { color: rgba(255,255,255,0.28); }
.af-thinking-block.af-thinking-open .af-thinking-chevron { transform: rotate(180deg); }

.af-thinking-content {
    display: none;
    padding: 12px 14px 14px;
    animation: af-think-reveal 0.16s ease;
    font-size: 13px;
    line-height: 1.8;
    color: rgba(255,255,255,0.42);
    font-family: 'Inter', system-ui, sans-serif;
}
@keyframes af-think-reveal {
    from { opacity: 0; transform: translateY(-2px); }
    to   { opacity: 1; transform: translateY(0); }
}
.af-thinking-block.af-thinking-open .af-thinking-content { display: block; }

/* Headings inside thinking */
.af-thinking-content h1.af-h1,
.af-thinking-content h2.af-h2,
.af-thinking-content h3.af-h3,
.af-thinking-content h4.af-h4 {
    display: block;
    font-weight: 600;
    color: rgba(255,255,255,0.72);
    margin: 14px 0 5px;
    line-height: 1.35;
    padding: 0;
    border: none;
    background: none;
}
.af-thinking-content h1.af-h1:first-child,
.af-thinking-content h2.af-h2:first-child,
.af-thinking-content h3.af-h3:first-child,
.af-thinking-content h4.af-h4:first-child { margin-top: 0; }

.af-thinking-content h1.af-h1 { font-size: 15px; }
.af-thinking-content h2.af-h2 { font-size: 14px; }
.af-thinking-content h3.af-h3 { font-size: 13.5px; color: rgba(255,255,255,0.65); }
.af-thinking-content h4.af-h4 { font-size: 13px;   color: rgba(255,255,255,0.58); font-weight: 500; }

/* Paragraphs */
.af-thinking-content p.af-p {
    margin: 0 0 9px;
    color: rgba(255,255,255,0.42);
}
.af-thinking-content p.af-p:last-child { margin-bottom: 0; }

/* Inline formatting */
.af-thinking-content strong {
    color: rgba(255,255,255,0.72);
    font-weight: 600;
}
.af-thinking-content em {
    color: rgba(255,255,255,0.52);
    font-style: italic;
}
.af-thinking-content del {
    color: rgba(255,255,255,0.28);
    text-decoration: line-through;
}

/* Blockquote */
.af-thinking-content blockquote.af-bq {
    display: block;
    border-left: 2px solid rgba(255,255,255,0.12);
    padding: 3px 11px;
    margin: 6px 0;
    color: rgba(255,255,255,0.32);
    font-style: italic;
    background: rgba(255,255,255,0.015);
    border-radius: 0 4px 4px 0;
}

/* Lists */
.af-thinking-content ul.af-ul,
.af-thinking-content ol.af-ol {
    margin: 5px 0 9px;
    padding-left: 18px;
    color: rgba(255,255,255,0.42);
}
.af-thinking-content ul.af-ul:last-child,
.af-thinking-content ol.af-ol:last-child { margin-bottom: 0; }
.af-thinking-content li {
    margin: 3px 0;
    line-height: 1.7;
}
.af-thinking-content ul.af-ul > li { list-style-type: disc; }
.af-thinking-content ul.af-ul > li::marker { color: rgba(255,255,255,0.22); }
.af-thinking-content ol.af-ol > li { list-style-type: decimal; }
.af-thinking-content ol.af-ol > li::marker { color: rgba(255,255,255,0.22); }

/* Inline code */
.af-thinking-content code.af-ic {
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 3px;
    padding: 1px 5px;
    font-size: 12px;
    font-family: 'SFMono-Regular', Consolas, 'Courier New', monospace;
    color: rgba(255,255,255,0.72);
}

/* Fenced code block */
.af-thinking-content .af-cb {
    background: rgba(0,0,0,0.38);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 6px;
    overflow: hidden;
    margin: 9px 0;
}
.af-thinking-content .af-cb-hdr {
    display: flex;
    align-items: center;
    padding: 5px 11px;
    background: rgba(255,255,255,0.025);
    border-bottom: 1px solid rgba(255,255,255,0.055);
}
.af-thinking-content .af-cb-lang {
    font-size: 10px;
    font-family: 'SFMono-Regular', Consolas, monospace;
    color: rgba(255,255,255,0.25);
    text-transform: uppercase;
    letter-spacing: 0.07em;
}
.af-thinking-content .af-cb-pre {
    display: block;
    padding: 9px 12px;
    margin: 0;
    font-size: 12px;
    font-family: 'SFMono-Regular', Consolas, 'Courier New', monospace;
    color: rgba(255,255,255,0.62);
    background: transparent;
    border: none;
    white-space: pre;
    overflow-x: auto;
    line-height: 1.65;
}
.af-thinking-content .af-cb-pre code {
    background: transparent;
    border: none;
    padding: 0;
    border-radius: 0;
    color: inherit;
    font-size: inherit;
}

/* Horizontal rule */
.af-thinking-content hr.af-hr {
    border: none;
    border-top: 1px solid rgba(255,255,255,0.07);
    margin: 11px 0;
}

/* Streaming pulse */
.af-thinking-block.af-thinking-streaming .af-thinking-icon {
    animation: af-pulse-icon 2s ease-in-out infinite;
}
@keyframes af-pulse-icon {
    0%, 100% { opacity: 0.22; }
    50%       { opacity: 0.55; }
}

/* ── Thinking Prompt Button ──────────────────────────────────── */

.af-think-wrap {
    display: inline-flex;
    align-items: center;
    position: relative;
    flex-shrink: 0;
}

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
    line-height: 1;
    position: relative;
}
.af-think-btn:hover {
    color: hsl(var(--text-primary, 0 0% 92%));
    background: rgba(255,255,255,0.05);
}
.af-think-btn.af-think-active {
    color: hsl(var(--text-primary, 0 0% 92%));
}
.af-think-btn svg { width: 15px; height: 15px; pointer-events: none; }

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

.af-think-menu-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #555;
    padding: 6px 10px 4px;
    font-family: 'Inter', sans-serif;
}

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

.af-think-divider { height: 1px; background: #222; margin: 4px 6px; }

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

@keyframes af-think-flash {
    0%, 100% { background: transparent; }
    50%       { background: rgba(255,255,255,0.07); }
}
.af-think-btn.af-think-flash { animation: af-think-flash 0.3s ease 2; }
    `;
    document.head.appendChild(style);
}

// ── Build thinking block UI ────────────────────────────────────────────────────

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
            metaHtml =
                `<span class="af-thinking-meta">` +
                parts.map((p, idx) =>
                    idx > 0
                        ? `<span class="af-thinking-meta-sep"></span>${p}`
                        : p
                ).join('') +
                `</span>`;
        }
    }

    const block = document.createElement('div');
    block.className =
        'af-thinking-block' + (isStreaming ? ' af-thinking-streaming' : '');
    block.setAttribute('data-af-thinking-block', '1');

    block.innerHTML = `
        <button class="af-thinking-toggle" type="button" aria-expanded="false">
            <span class="af-thinking-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77
                             4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
                    <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77
                             4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
                    <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
                </svg>
            </span>
            <span class="af-thinking-label">
                <span class="af-thinking-title">Thinking</span>
                ${metaHtml}
            </span>
            <span class="af-thinking-chevron">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 9l6 6 6-6"/>
                </svg>
            </span>
        </button>
        <div class="af-thinking-content">${contentHtml}</div>
    `;

    const toggle  = block.querySelector('.af-thinking-toggle');
    const content = block.querySelector('.af-thinking-content');

    toggle.addEventListener('click', () => {
        const open = block.classList.toggle('af-thinking-open');
        toggle.setAttribute('aria-expanded', String(open));
    });

    return block;
}

// ── Extract and decode raw text from a prose element ──────────────────────────
// Reads the DOM text rather than innerHTML to avoid double-escaping.

function extractRawText(el) {
    return el.textContent || '';
}

// ── Prose processing ───────────────────────────────────────────────────────────

function processProse(prose) {
    // Handle actual <thinking> DOM elements (model used real tags)
    prose.querySelectorAll('thinking:not([data-af-done])').forEach(el => {
        if (el.closest('pre, code, [data-af-thinking-block]')) return;
        const startTime = thinkingStartTimes.get(el);
        const dur       = startTime ? Date.now() - startTime : null;
        el.setAttribute('data-af-done', '1');
        const raw       = el.textContent?.trim() || '';
        const block     = buildBlock(renderMd(raw), false, dur);
        el.replaceWith(block);
    });

    // Handle escaped &lt;thinking&gt; ... &lt;/thinking&gt; in rendered HTML
    // Use a TreeWalker to find text nodes containing the escaped tags
    // This avoids innerHTML re-assignment which breaks React and fires observer loops
    processEscapedThinkingTags(prose);
}

function processEscapedThinkingTags(root) {
    const OPEN_STR  = '<thinking>';
    const CLOSE_STR = '</thinking>';

    // Collect all text content, skipping pre/code and already-processed blocks
    // We need to work with the serialised HTML to find escaped tags, but we
    // rebuild only the affected sections to avoid trashing the whole subtree.

    // Find all text nodes that contain the escaped open tag
    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                // Skip nodes inside code/pre/already processed blocks
                const p = node.parentElement;
                if (!p) return NodeFilter.FILTER_REJECT;
                if (p.closest('pre, code, [data-af-thinking-block]'))
                    return NodeFilter.FILTER_REJECT;
                // We're looking for the escaped form in raw text; the browser
                // decodes &lt; to < in textContent, so we look for literal < >
                if (node.nodeValue.includes(OPEN_STR))
                    return NodeFilter.FILTER_ACCEPT;
                return NodeFilter.FILTER_SKIP;
            }
        }
    );

    // Collect nodes first (don't mutate during walk)
    const startNodes = [];
    let node;
    while ((node = walker.nextNode())) startNodes.push(node);

    startNodes.forEach(startNode => {
        // Build a linear list of sibling/cousin text nodes from here
        // until we find the closing tag, then replace the range with a block.
        findAndReplaceThinkingRange(root, startNode, OPEN_STR, CLOSE_STR);
    });
}

function findAndReplaceThinkingRange(root, startNode, OPEN_STR, CLOSE_STR) {
    // Check if this startNode still has the open tag (may have been processed)
    if (!startNode.isConnected) return;
    if (!startNode.nodeValue.includes(OPEN_STR)) return;

    // The open tag might be mid-text. Split the text node at the open tag.
    const openIdx = startNode.nodeValue.indexOf(OPEN_STR);
    if (openIdx === -1) return;

    // Text before <thinking>
    const beforeText = startNode.nodeValue.slice(0, openIdx);
    // Text after <thinking> (could contain the closing tag on same node)
    const afterOpen  = startNode.nodeValue.slice(openIdx + OPEN_STR.length);

    // Collect all content between <thinking> and </thinking>
    // First check if closing tag is in the same text node
    const sameNodeClose = afterOpen.indexOf(CLOSE_STR);
    if (sameNodeClose !== -1) {
        // Everything is in one text node — simplest case
        const innerText  = afterOpen.slice(0, sameNodeClose);
        const afterClose = afterOpen.slice(sameNodeClose + CLOSE_STR.length);

        const parent = startNode.parentNode;
        if (!parent) return;

        const block = buildBlock(renderMd(innerText.trim()), false, null);

        // Replace this text node with: beforeText + block + afterClose
        const frag = document.createDocumentFragment();
        if (beforeText) frag.appendChild(document.createTextNode(beforeText));
        frag.appendChild(block);
        if (afterClose) frag.appendChild(document.createTextNode(afterClose));

        parent.replaceChild(frag, startNode);
        return;
    }

    // Closing tag is in a later node — walk forward collecting text
    // Collect inner content as a flat string across text nodes
    const collectedNodes = []; // nodes we'll remove
    let   innerText      = afterOpen;
    let   foundClose     = false;
    let   afterCloseText = '';

    // Walk forward from startNode's next sibling / up through ancestors
    let cursor = nextTextNode(startNode, root);
    while (cursor) {
        const val      = cursor.nodeValue;
        const closeIdx = val.indexOf(CLOSE_STR);
        if (closeIdx !== -1) {
            innerText       += val.slice(0, closeIdx);
            afterCloseText   = val.slice(closeIdx + CLOSE_STR.length);
            collectedNodes.push({ node: cursor, keep: afterCloseText });
            foundClose = true;
            break;
        }
        innerText += val;
        collectedNodes.push({ node: cursor, keep: null });
        cursor = nextTextNode(cursor, root);
    }

    if (!foundClose) return; // unclosed tag — leave alone

    const parent = startNode.parentNode;
    if (!parent) return;

    const block = buildBlock(renderMd(innerText.trim()), false, null);

    // Build replacement fragment
    const frag = document.createDocumentFragment();
    if (beforeText) frag.appendChild(document.createTextNode(beforeText));
    frag.appendChild(block);

    // Replace the start node
    parent.replaceChild(frag, startNode);

    // Remove / trim collected intermediate nodes
    collectedNodes.forEach(({ node: n, keep }) => {
        if (!n.isConnected) return;
        if (keep !== null && keep !== '') {
            n.nodeValue = keep;
        } else if (keep === '') {
            n.remove();
        } else {
            // keep === null — intermediate node, remove it
            // But only remove text nodes; don't touch element nodes
            // (the walker only gave us text nodes, so this is safe)
            n.remove();
        }
    });
}

// Walk to the next text node in document order, staying within root,
// skipping pre/code/already-processed blocks.
function nextTextNode(from, root) {
    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                if (node === from) return NodeFilter.FILTER_SKIP;
                const p = node.parentElement;
                if (!p) return NodeFilter.FILTER_REJECT;
                if (p.closest('pre, code, [data-af-thinking-block]'))
                    return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    // Advance walker to `from`, then return next
    let n;
    while ((n = walker.nextNode())) {
        if (n === from) return walker.nextNode();
    }
    // Fallback: just return first node after from in document order
    return null;
}

function checkStreaming(prose) {
    // Handle live <thinking> elements
    prose.querySelectorAll('thinking:not([data-af-done])').forEach(el => {
        if (el.closest('pre, code, [data-af-thinking-block]')) return;
        if (!el.getAttribute('data-af-streaming')) {
            el.setAttribute('data-af-streaming', '1');
            thinkingStartTimes.set(el, Date.now());
        }
    });

    // Check if we now have a complete escaped pair to process
    const fullText = prose.textContent || '';
    if (fullText.includes('<thinking>') && fullText.includes('</thinking>')) {
        processProse(prose);
    }
}

function scanAll() {
    document.querySelectorAll(
        '.prose, [class*="prose"], .markdown, [class*="markdown"]'
    ).forEach(prose => {
        if (prose.closest('.bg-surface-raised')) return;
        if (prose.getAttribute('data-af-thinking-scanned') === '1') {
            checkStreaming(prose);
            return;
        }
        prose.setAttribute('data-af-thinking-scanned', '1');
        checkStreaming(prose);
    });
}

// ── Enable / disable model thinking ───────────────────────────────────────────

function enableModelThinking() {
    injectThinkingStyle();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded',
            () => waitForHydration(scanAll));
    } else {
        waitForHydration(scanAll);
    }

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
    if (thinkingObserver) {
        thinkingObserver.disconnect();
        thinkingObserver = null;
    }
    document.querySelectorAll('[data-af-thinking-block]').forEach(block => {
        const content = block.querySelector('.af-thinking-content');
        const span    = document.createElement('span');
        span.textContent = content
            ? `<thinking>${content.textContent}</thinking>`
            : '';
        block.replaceWith(span);
    });
    document.querySelectorAll('[data-af-thinking-scanned]').forEach(el =>
        el.removeAttribute('data-af-thinking-scanned')
    );
    document.getElementById(MODEL_THINKING_STYLE_ID)?.remove();
}

// ── Menu helpers ───────────────────────────────────────────────────────────────

function openMenu(m)   { m.classList.add('af-open'); }
function closeMenu(m)  { m.classList.remove('af-open'); }
function toggleMenu(m) {
    m.classList.contains('af-open') ? closeMenu(m) : openMenu(m);
}

function syncThinkingUI() {
    const cid       = getThinkingConvId();
    const state     = convState[cid];
    const sent      = !!state?.sent;
    const activeLvl =
        LEVELS.find(l => l.value === (state?.level || thinkingPromptLevel))
        || getLevel();

    document.querySelectorAll('.af-think-btn').forEach(btn => {
        btn.classList.toggle('af-think-active', sent);
        const tip = btn.querySelector('.af-think-tooltip');
        if (tip) tip.textContent = sent
            ? `Thinking: ${activeLvl.label} (active)`
            : 'Thinking Prompt';
    });

    document.querySelectorAll('.af-think-item').forEach(item => {
        item.classList.toggle(
            'af-sel', item.dataset.value === thinkingPromptLevel
        );
    });

    document.querySelectorAll('.af-think-status-badge').forEach(badge => {
        badge.classList.toggle('on', sent);
        badge.textContent = sent ? activeLvl.label : 'Off';
    });
}

function setThinkingLevel(value) {
    const cid  = getThinkingConvId();
    const prev = thinkingPromptLevel;
    thinkingPromptLevel = value;
    chrome.storage.local.set({ thinkingPromptLevel: value });
    if (prev !== value && convState[cid]?.sent) {
        convState[cid] = { sent: false, level: value };
    }
    syncThinkingUI();
}

// ── URL watcher (singleton) ────────────────────────────────────────────────────

function startUrlWatcher() {
    if (_urlWatcher) return;
    _urlWatcher = setInterval(() => {
        if (location.href !== _lastUrl) {
            _lastUrl = location.href;
            syncThinkingUI();
            setTimeout(injectThinkingButton, 500);
        }
    }, 800);
}

function stopUrlWatcher() {
    if (_urlWatcher) { clearInterval(_urlWatcher); _urlWatcher = null; }
}

// ── Dropdown menu ──────────────────────────────────────────────────────────────

function buildThinkingMenu(wrap) {
    const menu = document.createElement('div');
    menu.className = 'af-think-menu';

    const label = document.createElement('div');
    label.className = 'af-think-menu-label';
    label.textContent = 'Reasoning Depth';
    menu.appendChild(label);

    LEVELS.forEach(lvl => {
        const btn = document.createElement('button');
        btn.type      = 'button';
        btn.className = 'af-think-item' +
            (lvl.value === thinkingPromptLevel ? ' af-sel' : '');
        btn.dataset.value = lvl.value;
        btn.innerHTML = lvl.icon + `<span>${lvl.label}</span>`;
        btn.addEventListener('click', e => {
            e.stopPropagation();
            setThinkingLevel(lvl.value);
            closeMenu(menu);
        });
        menu.appendChild(btn);
    });

    menu.appendChild(
        Object.assign(
            document.createElement('div'),
            { className: 'af-think-divider' }
        )
    );

    const cid       = getThinkingConvId();
    const state     = convState[cid];
    const sent      = !!state?.sent;
    const activeLvl =
        LEVELS.find(l => l.value === (state?.level || thinkingPromptLevel))
        || getLevel();

    const statusRow = document.createElement('div');
    statusRow.className = 'af-think-status-row';
    statusRow.innerHTML = `
        <span class="af-think-status-left">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77
                         4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
                <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77
                         4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
                <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
            </svg>
            Status
        </span>
        <span class="af-think-status-badge${sent ? ' on' : ''}">
            ${sent ? activeLvl.label : 'Off'}
        </span>
    `;
    menu.appendChild(statusRow);

    wrap.appendChild(menu);
    return menu;
}

// ── Build the prompt button ────────────────────────────────────────────────────

function buildThinkingButton(textarea) {
    const wrap = document.createElement('div');
    wrap.className = 'af-think-wrap';
    wrap.setAttribute('data-af-think-wrap', '1');

    const cid  = getThinkingConvId();
    const sent = !!convState[cid]?.sent;

    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'af-think-btn' + (sent ? ' af-think-active' : '');
    btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77
                     4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
            <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77
                     4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
            <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
            <path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/>
            <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/>
            <path d="M3.477 10.896a4 4 0 0 1 .585-.396"/>
            <path d="M19.938 10.5a4 4 0 0 1 .585.396"/>
        </svg>
        <span class="af-think-tooltip">
            ${sent ? `Thinking: ${getLevel().label} (active)` : 'Thinking Prompt'}
        </span>
    `;

    const caret = document.createElement('button');
    caret.type = 'button';
    caret.className = 'af-think-caret';
    caret.setAttribute('aria-label', 'Reasoning depth');
    caret.innerHTML = `
        <svg viewBox="0 0 10 6" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 1l4 4 4-4"/>
        </svg>
    `;

    const menu = buildThinkingMenu(wrap);

    btn.addEventListener('click', () => {
        const cid   = getThinkingConvId();
        const lvl   = getLevel();
        const state = convState[cid];

        if (state?.sent && state.level === thinkingPromptLevel) {
            btn.classList.add('af-think-flash');
            setTimeout(() => btn.classList.remove('af-think-flash'), 600);
            return;
        }

        const promptPrefix = lvl.prompt;
        const current      = textarea.value.trim();
        const newValue     = current
            ? `${promptPrefix}${current}`
            : promptPrefix.trim();

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

    wrap.appendChild(btn);
    wrap.appendChild(caret);
    return wrap;
}

// ── Inject / remove buttons ────────────────────────────────────────────────────

function injectThinkingButton() {
    let textareas = [
        ...document.querySelectorAll(
            "textarea[name='message'], textarea[placeholder*='Ask'], " +
            "textarea[data-testid='textbox'], textarea[placeholder*='Type'], " +
            "textarea[placeholder*='Send']"
        )
    ];

    if (!textareas.length) {
        textareas = [...document.querySelectorAll('textarea')].filter(ta =>
            !ta.disabled && ta.offsetParent !== null
        );
    }

    textareas.forEach(textarea => {
        if (textarea.dataset.afThinkInjected === '1') return;

        const form = textarea.closest('form') || textarea.parentNode;
        if (!form) return;
        if (form.querySelector('[data-af-think-wrap]')) return;

        textarea.dataset.afThinkInjected = '1';
        const wrap = buildThinkingButton(textarea);

        const enhanceWrap = form.querySelector('.af-enhance-wrap');
        if (enhanceWrap) {
            enhanceWrap.parentNode.insertBefore(wrap, enhanceWrap);
            return;
        }

        const submitBtn = form.querySelector(
            "button[type='submit'], button[aria-label*='Send'], " +
            "button[aria-label*='send'], button[id*='submit'], " +
            "button[data-testid*='send']"
        );
        if (submitBtn?.parentNode) {
            submitBtn.parentNode.insertBefore(wrap, submitBtn);
            return;
        }

        textarea.parentNode?.insertBefore(wrap, textarea.nextSibling);
    });
}

function removeThinkingButton() {
    document.querySelectorAll('[data-af-think-wrap]').forEach(wrap => wrap.remove());
    document.querySelectorAll('textarea[data-af-think-injected]').forEach(ta => {
        delete ta.dataset.afThinkInjected;
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
        thinkingBtnObserver.observe(document.body, {
            childList: true, subtree: true
        });
    }
}

function disableThinkingButton() {
    removeThinkingButton();
    if (thinkingBtnObserver) {
        thinkingBtnObserver.disconnect();
        thinkingBtnObserver = null;
    }
}

// ── Enable / disable ───────────────────────────────────────────────────────────

function enable() {
    injectThinkingStyle();
    enableModelThinking();
    enableThinkingButton();
    startUrlWatcher();
}

function disable() {
    disableModelThinking();
    disableThinkingButton();
    stopUrlWatcher();
}

// ── Init ───────────────────────────────────────────────────────────────────────

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