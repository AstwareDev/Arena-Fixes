const MODEL_THINKING_STYLE_ID = 'arena-fixes-model-thinking-style';
let modelThinkingEnabled = false;
let thinkingObserver = null;

// ── Styles ─────────────────────────────────────────────────────────────────
function injectThinkingStyle() {
    if (document.getElementById(MODEL_THINKING_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = MODEL_THINKING_STYLE_ID;
    style.textContent = `
        .af-thinking-block {
            border: 1px solid hsl(var(--border-faint, 240 5% 20%));
            border-radius: 10px;
            margin: 10px 0 6px;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.02);
            font-family: 'Inter', system-ui, sans-serif;
        }

        .af-thinking-toggle {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            padding: 9px 14px;
            background: transparent;
            border: none;
            color: hsl(var(--muted-foreground, 210 10% 52%));
            cursor: pointer;
            font-size: 12.5px;
            font-weight: 500;
            font-family: inherit;
            text-align: left;
            transition: background 0.15s ease, color 0.15s ease;
            user-select: none;
        }

        .af-thinking-toggle:hover {
            background: rgba(255, 255, 255, 0.04);
            color: hsl(var(--foreground, 0 0% 88%));
        }

        .af-thinking-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 18px;
            flex-shrink: 0;
            opacity: 0.7;
        }

        .af-thinking-icon svg {
            width: 14px;
            height: 14px;
        }

        .af-thinking-label {
            flex: 1;
            min-width: 0;
        }

        .af-thinking-meta {
            font-size: 11px;
            opacity: 0.5;
            font-weight: 400;
            margin-left: 4px;
        }

        .af-thinking-chevron {
            flex-shrink: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
            opacity: 0.5;
        }

        .af-thinking-chevron svg {
            width: 12px;
            height: 12px;
        }

        .af-thinking-block.af-thinking-open .af-thinking-chevron {
            transform: rotate(180deg);
        }

        .af-thinking-block.af-thinking-open .af-thinking-toggle {
            border-bottom: 1px solid hsl(var(--border-faint, 240 5% 20%));
        }

        .af-thinking-content {
            display: none;
            padding: 12px 16px 14px;
            font-size: 13px;
            line-height: 1.65;
            color: hsl(var(--muted-foreground, 210 10% 50%));
            animation: af-thinking-reveal 0.18s ease;
        }

        @keyframes af-thinking-reveal {
            from { opacity: 0; transform: translateY(-4px); }
            to   { opacity: 1; transform: translateY(0); }
        }

        .af-thinking-block.af-thinking-open .af-thinking-content {
            display: block;
        }

        /* Style inner content nicely */
        .af-thinking-content h1,
        .af-thinking-content h2,
        .af-thinking-content h3 {
            font-size: 13px;
            font-weight: 600;
            color: hsl(var(--foreground, 0 0% 85%));
            margin: 10px 0 4px;
        }

        .af-thinking-content h1:first-child,
        .af-thinking-content h2:first-child,
        .af-thinking-content h3:first-child {
            margin-top: 0;
        }

        .af-thinking-content p {
            margin: 4px 0;
        }

        .af-thinking-content ul,
        .af-thinking-content ol {
            margin: 4px 0;
            padding-left: 18px;
        }

        .af-thinking-content li {
            margin: 2px 0;
        }

        .af-thinking-content code {
            background: rgba(255,255,255,0.06);
            border-radius: 4px;
            padding: 1px 5px;
            font-size: 12px;
        }

        .af-thinking-content strong {
            color: hsl(var(--foreground, 0 0% 82%));
            font-weight: 600;
        }

        /* Pulse animation while streaming */
        .af-thinking-block.af-thinking-streaming .af-thinking-icon svg {
            animation: af-thinking-pulse 1.4s ease-in-out infinite;
        }

        @keyframes af-thinking-pulse {
            0%, 100% { opacity: 0.5; }
            50%       { opacity: 1; }
        }
    `;
    document.head.appendChild(style);
}

// ── Word count helper ────────────────────────────────────────────────────────
function wordCount(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const words = (tmp.textContent || '').trim().split(/\s+/).filter(Boolean).length;
    return words;
}

// ── Build the collapsible block ──────────────────────────────────────────────
function buildThinkingBlock(innerHtml, isStreaming) {
    const block = document.createElement('div');
    block.className = 'af-thinking-block' + (isStreaming ? ' af-thinking-streaming' : '');
    block.setAttribute('data-af-thinking-block', '1');

    const words = isStreaming ? null : wordCount(innerHtml);
    const metaText = isStreaming ? 'thinking…' : `${words} word${words !== 1 ? 's' : ''}`;

    block.innerHTML = `
        <button class="af-thinking-toggle" type="button" aria-expanded="false">
            <span class="af-thinking-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                     stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
                    <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
                    <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
                    <path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/>
                    <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/>
                    <path d="M3.477 10.896a4 4 0 0 1 .585-.396"/>
                    <path d="M19.938 10.5a4 4 0 0 1 .585.396"/>
                    <path d="M6 18a4 4 0 0 1-1.967-.516"/>
                    <path d="M19.967 17.484A4 4 0 0 1 18 18"/>
                </svg>
            </span>
            <span class="af-thinking-label">
                Thinking
                <span class="af-thinking-meta">${metaText}</span>
            </span>
            <span class="af-thinking-chevron">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 9l6 6 6-6"/>
                </svg>
            </span>
        </button>
        <div class="af-thinking-content">${innerHtml}</div>
    `;

    const toggle = block.querySelector('.af-thinking-toggle');
    toggle.addEventListener('click', () => {
        const open = block.classList.toggle('af-thinking-open');
        toggle.setAttribute('aria-expanded', String(open));
    });

    return block;
}

// ── Core processor ───────────────────────────────────────────────────────────
function processProseElement(prose) {
    if (prose.getAttribute('data-af-thinking-processed') === '1') return;

    const html = prose.innerHTML;

    // Match encoded <thinking>...</thinking> pairs (complete only)
    const openTag  = '&lt;thinking&gt;';
    const closeTag = '&lt;/thinking&gt;';

    if (!html.includes(openTag)) return;

    // Only process if we have a complete pair (not mid-stream)
    if (!html.includes(closeTag)) return;

    prose.setAttribute('data-af-thinking-processed', '1');

    let newHTML = html;
    let offset = 0;
    const parts = [];
    let searchFrom = 0;

    while (true) {
        const start = newHTML.indexOf(openTag, searchFrom);
        if (start === -1) break;
        const end = newHTML.indexOf(closeTag, start + openTag.length);
        if (end === -1) break;

        parts.push({ start, end: end + closeTag.length, inner: newHTML.slice(start + openTag.length, end) });
        searchFrom = end + closeTag.length;
    }

    if (parts.length === 0) return;

    // Build replacement HTML working backwards to preserve indices
    let result = newHTML;
    for (let i = parts.length - 1; i >= 0; i--) {
        const { start, end, inner } = parts[i];
        const placeholder = `<div data-af-thinking-placeholder="${i}"></div>`;
        result = result.slice(0, start) + placeholder + result.slice(end);
    }

    prose.innerHTML = result;

    // Replace placeholders with real DOM nodes
    parts.forEach(({ inner }, i) => {
        const placeholder = prose.querySelector(`[data-af-thinking-placeholder="${i}"]`);
        if (!placeholder) return;
        const block = buildThinkingBlock(inner.trim(), false);
        placeholder.replaceWith(block);
    });
}

// ── Handle streaming: watch for incomplete <thinking> blocks ─────────────────
function processStreamingElement(prose) {
    if (prose.getAttribute('data-af-thinking-processed') === '1') return;

    const html = prose.innerHTML;
    const openTag  = '&lt;thinking&gt;';
    const closeTag = '&lt;/thinking&gt;';

    const hasOpen  = html.includes(openTag);
    const hasClose = html.includes(closeTag);

    if (!hasOpen) return;

    // Complete block — hand off to normal processor
    if (hasOpen && hasClose) {
        processProseElement(prose);
        return;
    }

    // Streaming in progress: mark with streaming state for visual feedback
    if (!prose.getAttribute('data-af-thinking-streaming')) {
        prose.setAttribute('data-af-thinking-streaming', '1');
    }
}

// ── Scan all model response prose elements ───────────────────────────────────
function scanProseElements() {
    // Model responses are in the right-side prose divs (not user bubbles)
    const proses = document.querySelectorAll(
        '.prose:not([data-af-thinking-processed])'
    );
    proses.forEach(prose => {
        // Skip user-message prose (inside bg-surface-raised bubbles)
        if (prose.closest('.bg-surface-raised')) return;
        processStreamingElement(prose);
    });

    // Re-check streaming ones that might now be complete
    document.querySelectorAll('.prose[data-af-thinking-streaming]').forEach(prose => {
        if (prose.getAttribute('data-af-thinking-processed') === '1') {
            prose.removeAttribute('data-af-thinking-streaming');
            return;
        }
        const html = prose.innerHTML;
        if (html.includes('&lt;/thinking&gt;')) {
            prose.removeAttribute('data-af-thinking-streaming');
            processProseElement(prose);
        }
    });
}

// ── Enable / disable ─────────────────────────────────────────────────────────
function enableModelThinking() {
    injectThinkingStyle();
    scanProseElements();

    if (!thinkingObserver) {
        let debounce = null;
        thinkingObserver = new MutationObserver(() => {
            if (debounce) return;
            debounce = setTimeout(() => {
                debounce = null;
                scanProseElements();
            }, 180);
        });
        thinkingObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
}

function disableModelThinking() {
    if (thinkingObserver) {
        thinkingObserver.disconnect();
        thinkingObserver = null;
    }

    // Restore original content
    document.querySelectorAll('[data-af-thinking-block]').forEach(block => {
        const content = block.querySelector('.af-thinking-content');
        if (content) {
            const frag = document.createDocumentFragment();
            const tmp = document.createElement('div');
            tmp.innerHTML = `&lt;thinking&gt;${content.innerHTML}&lt;/thinking&gt;`;
            while (tmp.firstChild) frag.appendChild(tmp.firstChild);
            block.replaceWith(frag);
        } else {
            block.remove();
        }
    });

    document.querySelectorAll('.prose[data-af-thinking-processed]').forEach(el => {
        el.removeAttribute('data-af-thinking-processed');
    });
    document.querySelectorAll('.prose[data-af-thinking-streaming]').forEach(el => {
        el.removeAttribute('data-af-thinking-streaming');
    });

    const style = document.getElementById(MODEL_THINKING_STYLE_ID);
    if (style) style.remove();
}

// ── Init ─────────────────────────────────────────────────────────────────────
chrome.storage.local.get(['modelThinkingEnabled'], data => {
    modelThinkingEnabled = !!data.modelThinkingEnabled;
    if (modelThinkingEnabled) enableModelThinking();
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if ('modelThinkingEnabled' in changes) {
        modelThinkingEnabled = !!changes.modelThinkingEnabled.newValue;
        modelThinkingEnabled ? enableModelThinking() : disableModelThinking();
    }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'REFRESH_MODEL_THINKING') return;
    chrome.storage.local.get(['modelThinkingEnabled'], data => {
        modelThinkingEnabled = !!data.modelThinkingEnabled;
        modelThinkingEnabled ? enableModelThinking() : disableModelThinking();
    });
    sendResponse({ ok: true });
    return true;
});