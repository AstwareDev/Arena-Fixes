// constants.js is loaded before this file by the manifest and exposes
// MSG, IDS, ATTR, STORAGE_KEYS, etc. as window globals.

const processedRows = new WeakSet();

// ─── Selectors / IDs (via IDS / ATTR constants) ───────────────────────────────
function getUserMessageRows() {
    return [...document.querySelectorAll('div.flex.min-w-0.flex-1.items-center.justify-end.gap-2')];
}

function getUserBubble(row) {
    return row.querySelector('div.bg-surface-raised');
}

function getMessageText(row) {
    const bubble = getUserBubble(row);
    if (!bubble) return '';
    const prose = bubble.querySelector('.prose');
    return prose ? prose.innerText.trim() : bubble.innerText.trim();
}

function getOriginalCopyButton(row) {
    return [...row.querySelectorAll('button')].find(btn => {
        const cls      = btn.className || '';
        const svgCount = btn.querySelectorAll('svg').length;
        const text     = (btn.textContent || '').trim();
        return svgCount === 2 && text.length === 0 && cls.includes('relative') && cls.includes('rounded-md');
    }) || null;
}

function getVisualBottomMostRow(rows) {
    if (!rows.length) return null;
    return [...rows]
        .filter(row => getUserBubble(row))
        .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] || null;
}

function hideOriginalButton(btn) {
    btn.setAttribute(ATTR.ORIG_COPY, '1');
    btn.style.opacity       = '0';
    btn.style.pointerEvents = 'none';
    btn.style.width         = '0px';
    btn.style.height        = '0px';
    btn.style.overflow      = 'hidden';
    btn.style.margin        = '0';
    btn.style.padding       = '0';
    btn.style.minWidth      = '0';
    btn.style.minHeight     = '0';
}

function unhideOriginalButton(btn) {
    btn.style.opacity       = '';
    btn.style.pointerEvents = '';
    btn.style.width         = '';
    btn.style.height        = '';
    btn.style.overflow      = '';
    btn.style.margin        = '';
    btn.style.padding       = '';
    btn.style.minWidth      = '';
    btn.style.minHeight     = '';
    btn.removeAttribute(ATTR.ORIG_COPY);
}

// ─── Copy button styles ────────────────────────────────────────────────────────
function ensureStyleTag() {
    if (document.getElementById(IDS.COPY_STYLE)) return;
    const style = document.createElement('style');
    style.id = IDS.COPY_STYLE;
    style.textContent = `
        .arena-fixes-copy-btn {
            position: relative;
            opacity: 0;
            transition: opacity 0.18s ease;
        }
        .arena-fixes-copy-host:hover .arena-fixes-copy-btn { opacity: 1; }
        .arena-fixes-copy-btn .arena-fixes-copy-inner {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            opacity: 1;
            transition: opacity 0.2s ease;
        }
        .arena-fixes-copy-btn .arena-fixes-copy-check {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            font-size: 14px;
            font-weight: 600;
            transition: opacity 0.2s ease;
            pointer-events: none;
        }
        .arena-fixes-copy-btn.arena-fixes-copied { opacity: 1 !important; }
        .arena-fixes-copy-btn.arena-fixes-copied .arena-fixes-copy-inner { opacity: 0; }
        .arena-fixes-copy-btn.arena-fixes-copied .arena-fixes-copy-check { opacity: 1; }
    `;
    document.head.appendChild(style);
}

function buildBottomButton(originalCopy) {
    const btn  = originalCopy.cloneNode(true);
    btn.disabled = false;
    btn.classList.add('arena-fixes-copy-btn');
    btn.style.pointerEvents = 'auto';
    btn.style.width = btn.style.height = btn.style.overflow =
        btn.style.margin = btn.style.padding =
        btn.style.minWidth = btn.style.minHeight = '';

    const inner = document.createElement('span');
    inner.className = 'arena-fixes-copy-inner';
    while (btn.firstChild) inner.appendChild(btn.firstChild);

    const check = document.createElement('span');
    check.className  = 'arena-fixes-copy-check';
    check.textContent = '✓';

    btn.appendChild(inner);
    btn.appendChild(check);

    btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        originalCopy.click();
        btn.classList.add('arena-fixes-copied');
        setTimeout(() => btn.classList.remove('arena-fixes-copied'), 1200);
    });

    return btn;
}

function addBottomButtonToRow(row) {
    if (processedRows.has(row)) return;

    const bubble      = getUserBubble(row);
    const originalCopy = getOriginalCopyButton(row);
    if (!bubble || !originalCopy) return;

    const bubbleWrap = bubble.parentElement;
    if (!bubbleWrap) return;

    if (bubbleWrap.querySelector(`[${ATTR.BOTTOM_COPY}]`)) {
        processedRows.add(row);
        return;
    }

    bubbleWrap.style.display       = 'flex';
    bubbleWrap.style.flexDirection = 'column';
    bubbleWrap.style.alignItems    = 'flex-end';

    const wrap = document.createElement('div');
    wrap.setAttribute(ATTR.BOTTOM_COPY, '1');
    wrap.className          = 'arena-fixes-copy-host';
    wrap.style.display      = 'flex';
    wrap.style.justifyContent = 'flex-end';
    wrap.style.width        = '100%';
    wrap.style.marginTop    = '6px';

    wrap.appendChild(buildBottomButton(originalCopy));
    bubbleWrap.appendChild(wrap);
    hideOriginalButton(originalCopy);
    processedRows.add(row);
}

function enableBottomCopyButtons() {
    ensureStyleTag();
    getUserMessageRows().forEach(addBottomButtonToRow);
}

function disableBottomCopyButtons() {
    document.querySelectorAll(`[${ATTR.BOTTOM_COPY}]`).forEach(el => el.remove());
    document.querySelectorAll(`[${ATTR.ORIG_COPY}="1"]`).forEach(unhideOriginalButton);
}

function getBottomMostUserMessageText() {
    const bottomRow = getVisualBottomMostRow(getUserMessageRows());
    return bottomRow ? getMessageText(bottomRow) : '';
}

function copyBottomMostUserMessage() {
    const bottomRow = getVisualBottomMostRow(getUserMessageRows());
    if (!bottomRow) return false;
    const originalCopy = getOriginalCopyButton(bottomRow);
    if (originalCopy) { originalCopy.click(); return true; }
    return false;
}

// ─── Raw Markdown ─────────────────────────────────────────────────────────────
let rawMarkdownEnabled  = false;
let rawMarkdownObserver = null;

function getRawTextFromRow(row) {
    const originalCopy = getOriginalCopyButton(row);
    if (!originalCopy) return null;
    return new Promise(resolve => {
        const handler = e => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.removeEventListener('copy', handler, true);
            resolve(text);
        };
        document.addEventListener('copy', handler, true);
        originalCopy.click();
        setTimeout(() => { document.removeEventListener('copy', handler, true); resolve(null); }, 1000);
    });
}

async function applyRawMarkdownToRow(row) {
    if (row.getAttribute(ATTR.RAW_APPLIED) === '1') return;
    const bubble = getUserBubble(row);
    if (!bubble) return;
    const prose = bubble.querySelector('.prose');
    if (!prose) return;
    const rawText = prose.innerText.trim();
    if (!rawText) return;

    row.setAttribute(ATTR.RAW_APPLIED, '1');
    const pre = document.createElement('pre');
    pre.setAttribute(ATTR.RAW_PRE, '1');
    pre.style.cssText = 'white-space:pre-wrap;word-break:break-word;font-family:inherit;font-size:inherit;margin:0;padding:0;background:transparent;border:none;color:inherit;';
    pre.textContent   = rawText;
    prose.style.display = 'none';
    prose.parentElement.insertBefore(pre, prose);
}

function enableRawMarkdown() {
    rawMarkdownEnabled = true;
    getUserMessageRows().forEach(applyRawMarkdownToRow);
    if (!rawMarkdownObserver) {
        rawMarkdownObserver = new MutationObserver(() => {
            if (!rawMarkdownEnabled) return;
            getUserMessageRows().forEach(applyRawMarkdownToRow);
        });
        rawMarkdownObserver.observe(document.body, { childList: true, subtree: true });
    }
}

function disableRawMarkdown() {
    rawMarkdownEnabled = false;
    if (rawMarkdownObserver) { rawMarkdownObserver.disconnect(); rawMarkdownObserver = null; }
    document.querySelectorAll(`[${ATTR.RAW_APPLIED}="1"]`).forEach(row => {
        row.removeAttribute(ATTR.RAW_APPLIED);
        const bubble = getUserBubble(row);
        if (!bubble) return;
        const prose = bubble.querySelector('.prose');
        if (prose) prose.style.display = '';
        bubble.querySelectorAll(`[${ATTR.RAW_PRE}="1"]`).forEach(pre => pre.remove());
    });
}

// ─── LMArena Theme ────────────────────────────────────────────────────────────
function applyLMArenaSidebarRounding() {
    const sidebar = document.querySelector('[data-sidebar="sidebar"]');
    if (!sidebar || sidebar.getAttribute(ATTR.ROUNDED) === '1') return;
    sidebar.classList.remove('overflow-hidden');
    sidebar.style.setProperty('border-top-right-radius',    '20px', 'important');
    sidebar.style.setProperty('border-bottom-right-radius', '20px', 'important');
    sidebar.style.setProperty('overflow', 'visible', 'important');
    sidebar.setAttribute(ATTR.ROUNDED, '1');
    const rail = document.querySelector('button[data-sidebar="rail"]');
    if (rail) rail.style.setProperty('display', 'none', 'important');
}

function removeLMArenaSidebarRounding() {
    const sidebar = document.querySelector('[data-sidebar="sidebar"]');
    if (!sidebar) return;
    sidebar.style.removeProperty('border-top-right-radius');
    sidebar.style.removeProperty('border-bottom-right-radius');
    sidebar.style.removeProperty('overflow');
    sidebar.removeAttribute(ATTR.ROUNDED);
    const rail = document.querySelector('button[data-sidebar="rail"]');
    if (rail) rail.style.removeProperty('display');
}

function applyLMArenaInputBar() {
    const addFilesBtn = [...document.querySelectorAll('button[aria-label="Add files and more"]')]
        .find(btn => btn.querySelector('.lucide-paperclip'));
    if (!addFilesBtn || addFilesBtn.getAttribute(ATTR.INPUT_BAR) === '1') return;

    const svg = addFilesBtn.querySelector('svg');
    if (svg) {
        svg.innerHTML = '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>';
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('width', '14');
        svg.setAttribute('height', '14');
    }
    const span = addFilesBtn.querySelector('span');
    if (span) span.remove();
    addFilesBtn.style.setProperty('padding-left',  '6px', 'important');
    addFilesBtn.style.setProperty('padding-right', '6px', 'important');
    addFilesBtn.setAttribute(ATTR.INPUT_BAR, '1');
}

function removeLMArenaInputBar() {
    const btn = document.querySelector(`button[${ATTR.INPUT_BAR}="1"]`);
    if (!btn) return;
    btn.removeAttribute(ATTR.INPUT_BAR);
    const svg = btn.querySelector('svg');
    if (svg) svg.innerHTML = '<path d="M13.234 20.252 21 12.3"></path><path d="m16 6-8.414 8.586a2 2 0 0 0 0 2.828 2 2 0 0 0 2.828 0l8.414-8.586a4 4 0 0 0 0-5.656 4 4 0 0 0-5.656 0l-8.415 8.585a6 6 0 1 0 8.486 8.486"></path>';
}

function hideYouTubeCTA() {
    document.querySelectorAll('video').forEach(video => {
        if (!video.src?.includes('youtube-channel-ad')) return;
        const cta = video.closest('.animate-in, [style*="will-change"]');
        if (cta) { cta.setAttribute(ATTR.HIDDEN_CTA, '1'); cta.style.setProperty('display', 'none', 'important'); }
    });
}

function showYouTubeCTA() {
    document.querySelectorAll(`[${ATTR.HIDDEN_CTA}="1"]`).forEach(el => {
        el.style.removeProperty('display');
        el.removeAttribute(ATTR.HIDDEN_CTA);
    });
}

function applyLMArenaIcons() {
    for (const svg of [...document.querySelectorAll('svg.h-5.w-5')]) {
        if (svg.getAttribute(ATTR.ICON)) continue;
        const paths = svg.querySelectorAll('path');
        const hasNewChat     = [...paths].some(p => p.getAttribute('d')?.includes('M12 22C17.5228'));
        const hasLeaderboard = [...paths].some(p => p.getAttribute('d')?.includes('M9 5L21 5'));

        if (hasNewChat) {
            svg.setAttribute(ATTR.ICON, 'newchat');
            svg.setAttribute('width', '1.8em'); svg.setAttribute('height', '1.8em');
            svg.innerHTML = `<path d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path><path d="M15.5 2.5a2.121 2.121 0 0 1 3 3L12 12l-4 1 1-4 6.5-6.5z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path>`;
        }
        if (hasLeaderboard) {
            svg.setAttribute(ATTR.ICON, 'leaderboard');
            svg.setAttribute('width', '1.8em'); svg.setAttribute('height', '1.8em');
            svg.innerHTML = `<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path><path d="M4 22h16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path>`;
        }
    }

    for (const svg of [...document.querySelectorAll('svg[width="16"][height="16"]')]) {
        if (svg.getAttribute(ATTR.ICON) === 'chain-replacement' || svg.getAttribute(ATTR.ICON) === 'chain') continue;
        const hasChain = [...svg.querySelectorAll('path')].some(p => p.getAttribute('d')?.includes('M22 14V6'));
        if (!hasChain) continue;

        svg.setAttribute(ATTR.ICON, 'chain');
        svg.style.setProperty('display', 'none', 'important');

        const newSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        newSvg.setAttribute('width', '20'); newSvg.setAttribute('height', '20');
        newSvg.setAttribute('viewBox', '0 0 24 24'); newSvg.setAttribute('fill', 'none');
        newSvg.setAttribute('stroke', 'currentColor'); newSvg.setAttribute('stroke-width', '1.5');
        newSvg.setAttribute('stroke-linecap', 'round'); newSvg.setAttribute('stroke-linejoin', 'round');
        newSvg.setAttribute(ATTR.ICON, 'chain-replacement');
        newSvg.innerHTML = `<path d="M11 14h2a2 2 0 0 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16"></path><path d="m14.45 13.39 5.05-4.694C20.196 8 21 6.85 21 5.75a2.75 2.75 0 0 0-4.797-1.837.276.276 0 0 1-.406 0A2.75 2.75 0 0 0 11 5.75c0 1.2.802 2.248 1.5 2.946L16 11.95"></path><path d="m2 15 6 6"></path><path d="m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a1 1 0 0 0-2.75-2.91"></path>`;
        svg.parentElement.insertBefore(newSvg, svg);
    }

    hideYouTubeCTA();
}

function applyLMArenaModalityIcons() {
    for (const btn of [...document.querySelectorAll('button[data-modality-button="true"]')]) {
        if (btn.getAttribute(ATTR.MODALITY_ICON)) continue;
        const label = btn.getAttribute('aria-label');
        const svg   = btn.querySelector('svg');
        if (!svg) continue;

        if (label === 'Code') {
            btn.setAttribute(ATTR.MODALITY_ICON, 'code');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.innerHTML = `<path d="m16 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="m8 6-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
        }
        if (label === 'Search') {
            btn.setAttribute(ATTR.MODALITY_ICON, 'search');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.innerHTML = `<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12h20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
        }
    }

    for (const btn of [...document.querySelectorAll('button[type="submit"]')]) {
        if (btn.getAttribute(ATTR.MODALITY_ICON)) continue;
        const svg = btn.querySelector('svg');
        if (!svg) continue;
        const hasArrow = [...svg.querySelectorAll('path')].some(p => p.getAttribute('d')?.includes('M3 12L21 12'));
        if (!hasArrow) continue;
        btn.setAttribute(ATTR.MODALITY_ICON, 'submit');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.innerHTML = `<path d="m5 12 7-7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 19V5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
}

function removeLMArenaModalityIcons() {
    document.querySelectorAll(`[${ATTR.MODALITY_ICON}="code"]`).forEach(btn => {
        btn.removeAttribute(ATTR.MODALITY_ICON);
        const svg = btn.querySelector('svg');
        if (svg) svg.innerHTML = `<path d="M13.5 6L10 18.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path><path d="M6.5 8.5L3 12L6.5 15.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path><path d="M17.5 8.5L21 12L17.5 15.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path>`;
    });
    document.querySelectorAll(`[${ATTR.MODALITY_ICON}="search"]`).forEach(btn => {
        btn.removeAttribute(ATTR.MODALITY_ICON);
        const svg = btn.querySelector('svg');
        if (svg) svg.innerHTML = `<path d="M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path><path d="M13 2.04932C13 2.04932 16 5.99994 16 11.9999" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path><path d="M11 21.9506C11 21.9506 8 17.9999 8 11.9999C8 5.99994 11 2.04932 11 2.04932" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path><path d="M2.62964 15.5H12" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path><path d="M2.62964 8.5H21.3704" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M21.8789 17.9174C22.3727 18.2211 22.3423 18.9604 21.8337 19.0181L19.2671 19.309L18.1159 21.6213C17.8878 22.0795 17.1827 21.8552 17.0661 21.2873L15.8108 15.1713C15.7123 14.6913 16.1437 14.3892 16.561 14.646L21.8789 17.9174Z" stroke="currentColor"></path>`;
    });
    document.querySelectorAll(`[${ATTR.MODALITY_ICON}="submit"]`).forEach(btn => {
        btn.removeAttribute(ATTR.MODALITY_ICON);
        const svg = btn.querySelector('svg');
        if (svg) svg.innerHTML = `<path d="M3 12L21 12M21 12L12.5 3.5M21 12L12.5 20.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path>`;
    });
}

function removeLMArenaIcons() {
    const newChat = document.querySelector(`svg[${ATTR.ICON}="newchat"]`);
    if (newChat) {
        newChat.removeAttribute(ATTR.ICON);
        newChat.setAttribute('width', '1.5em'); newChat.setAttribute('height', '1.5em');
        newChat.innerHTML = `<path d="M9 12H12M15 12H12M12 12V9M12 12V15" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 13.8214 2.48697 15.5291 3.33782 17L2.5 21.5L7 20.6622C8.47087 21.513 10.1786 22 12 22Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path>`;
    }
    const leaderboard = document.querySelector(`svg[${ATTR.ICON}="leaderboard"]`);
    if (leaderboard) {
        leaderboard.removeAttribute(ATTR.ICON);
        leaderboard.setAttribute('width', '1.5em'); leaderboard.setAttribute('height', '1.5em');
        leaderboard.innerHTML = `<path d="M9 5L21 5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path><path d="M5 7L5 3L3.5 4.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path><path d="M5.5 14L3.5 14L5.40471 11.0371C5.46692 10.9403 5.50215 10.8268 5.47709 10.7145C5.41935 10.4557 5.216 10 4.5 10C3.50001 10 3.5 10.8889 3.5 10.8889C3.5 10.8889 3.5 10.8889 3.5 10.8889L3.5 11.1111" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path><path d="M4 19L4.5 19C5.05228 19 5.5 19.4477 5.5 20V20C5.5 20.5523 5.05228 21 4.5 21L3.5 21" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path><path d="M3.5 17L5.5 17L4 19" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path><path d="M9 12L21 12" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path><path d="M9 19L21 19" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path>`;
    }
    document.querySelectorAll(`svg[${ATTR.ICON}="chain"]`).forEach(svg => {
        svg.removeAttribute(ATTR.ICON); svg.style.removeProperty('display');
    });
    document.querySelectorAll(`svg[${ATTR.ICON}="chain-replacement"]`).forEach(svg => svg.remove());
    showYouTubeCTA();
}

function applyLMArenaFavicon() {
    const existing = document.querySelector('link[rel="icon"]');
    if (!existing) return;
    
    if (existing.href.includes('favicon.svg')) return;
    
    existing.href = '/images/favicon.svg';
    existing.type = 'image/svg+xml';
}

function removeLMArenaFavicon() {
    const existing = document.querySelector('link[rel="icon"]');
    if (!existing) return;
    existing.href = '/images/favicon-rebrand.svg';
}

function applyLMArenaSidebarIcon() {
    for (const svg of [...document.querySelectorAll('svg')]) {
        if (svg.getAttribute(ATTR.ICON) === 'sidebar') continue;
        const hasSidebar = [...svg.querySelectorAll('path')].some(p => p.getAttribute('d')?.includes('M9.5 21V3'));
        if (!hasSidebar) continue;
        svg.setAttribute(ATTR.ICON, 'sidebar');
        const img = document.createElement('img');
        img.src = chrome.runtime.getURL('lmarena.png');
        img.style.cssText = 'width:0.9em;height:0.9em;object-fit:contain;display:inline-block;vertical-align:middle;';
        img.setAttribute(ATTR.SIDEBAR_IMG, '1');
        svg.style.display = 'none';
        svg.parentElement.insertBefore(img, svg);
    }
}

function removeLMArenaSidebarIcon() {
    document.querySelectorAll(`img[${ATTR.SIDEBAR_IMG}="1"]`).forEach(img => img.remove());
    document.querySelectorAll(`svg[${ATTR.ICON}="sidebar"]`).forEach(svg => {
        svg.removeAttribute(ATTR.ICON); svg.style.display = '';
    });
}

function applyLMArenaTheme() {
    if (document.getElementById(IDS.LMARENA_THEME)) return;
    const style = document.createElement('style');
    style.id = IDS.LMARENA_THEME;
    style.textContent = `
        html, html.dark, :root, :root.dark {
            --background: 240 3% 12% !important;
            --sidebar-background: 228 4% 14% !important;
            --card: 240 3% 14% !important;
            --popover: 240 3% 12% !important;
            --surface-primary: 240 3% 12% !important;
            --surface-secondary: 228 4% 14% !important;
            --surface-raised: 240 3% 16% !important;
        }
        html, body { background-color: #1d1d1f !important; }
        main { background-color: #1d1d1f !important; }
        .bg-background { background-color: #1d1d1f !important; }
        .bg-sidebar { background-color: #222325 !important; }
        .bg-surface-primary { background-color: #1d1d1f !important; border-right: none !important; }
        .bg-surface-secondary { background-color: #222325 !important; }
        .bg-surface-raised { background-color: #222325 !important; }
        .bg-card { background-color: #222325 !important; }
        .bg-popover { background-color: #1d1d1f !important; }
        button[data-sidebar="rail"] { display: none !important; }
        button[data-sidebar="rail"]::after { display: none !important; content: none !important; width: 0 !important; background: none !important; }
        img[${ATTR.SIDEBAR_IMG}], #${IDS.LMARENA_LOGO} img { filter: none; }
    `;
    document.head.appendChild(style);

    if (!document.getElementById(IDS.CINZEL_FONT)) {
        const link = document.createElement('link');
        link.id   = IDS.CINZEL_FONT;
        link.rel  = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400&display=swap';
        document.head.appendChild(link);
    }

    applyLMArenaSidebarRounding();
    applyLMArenaInputBar();
    applyLMArenaIcons();
    applyLMArenaFavicon();
    applyLMArenaSidebarIcon();
    injectLMArenaLogo();
    injectThemeToggleButton();
    startColorWatcher();
    startLogoObserver();
    applyLMArenaModalityIcons();
}

function removeLMArenaTheme() {
    stopLogoObserver();
    stopColorWatcher();
    document.getElementById(IDS.LMARENA_THEME)?.remove();
    removeLMArenaLogo();
    removeLMArenaSidebarRounding();
    removeLMArenaInputBar();
    removeLMArenaIcons();
    removeLMArenaFavicon();
    removeLMArenaSidebarIcon();
    removeLightModeOverride();
    document.getElementById('arena-fixes-theme-btn')?.remove();
    showYouTubeCTA();
    removeLMArenaModalityIcons();
}

function findLogoSVG() {
    return document.querySelector('[data-sidebar="menu-button"] svg[viewBox="0 0 420 94"]');
}

function injectLMArenaLogo() {
    if (document.getElementById(IDS.LMARENA_LOGO)) return;
    const svg = findLogoSVG();
    if (!svg) return;
    const container = svg.parentElement;
    if (!container) return;
    svg.style.display = 'none';
    svg.setAttribute(ATTR.HIDDEN, '1');

    const logo = document.createElement('span');
    logo.id = IDS.LMARENA_LOGO;
    logo.setAttribute(ATTR.LOGO, '1');
    logo.style.cssText = 'display:inline-flex;align-items:center;gap:6px;flex-shrink:0;color:currentColor;';

    const img  = document.createElement('img');
    img.src    = chrome.runtime.getURL('lmarena.png');
    img.style.cssText = 'width:16px;height:16px;object-fit:contain;flex-shrink:0;';

    const text = document.createElement('span');
    text.style.cssText = 'display:inline-flex;align-items:center;';
    text.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="420 30 1110 240" style="height:14px;width:auto;fill:currentColor;flex-shrink:0;"><path d="M1456.56 269.994C1444.96 269.994 1435.32 267.929 1427.65 263.8C1419.99 259.671 1414.28 254.263 1410.55 247.578C1406.81 240.696 1404.94 233.224 1404.94 225.162C1404.94 210.218 1410.35 198.912 1421.16 191.243C1432.18 183.378 1446.82 179.445 1465.11 179.445H1505.22V176.496C1505.22 150.934 1493.52 138.153 1470.13 138.153C1460.69 138.153 1452.72 140.217 1446.23 144.347C1439.94 148.476 1435.91 154.965 1434.14 163.813H1408.78C1409.76 153.982 1413 145.527 1418.51 138.448C1424.21 131.369 1431.49 125.962 1440.34 122.226C1449.18 118.49 1459.11 116.622 1470.13 116.622C1490.97 116.622 1506.11 122.127 1515.55 133.139C1525.18 143.953 1530 158.406 1530 176.496V266.455H1508.76L1506.7 243.744H1504.63C1500.31 250.822 1494.51 257.016 1487.23 262.325C1480.15 267.438 1469.93 269.994 1456.56 269.994ZM1460.98 248.168C1470.42 248.168 1478.38 245.907 1484.87 241.384C1491.56 236.862 1496.57 230.864 1499.91 223.392C1503.45 215.92 1505.22 207.76 1505.22 198.912H1467.18C1453.81 198.912 1444.37 201.173 1438.86 205.696C1433.55 210.218 1430.9 216.215 1430.9 223.687C1430.9 231.356 1433.45 237.353 1438.57 241.679C1443.68 246.005 1451.15 248.168 1460.98 248.168Z"/><path d="M1244.55 266.455V120.161H1265.2L1267.85 142.282H1269.33C1273.26 135.203 1279.45 129.206 1287.91 124.29C1296.36 119.178 1306.1 116.622 1317.11 116.622C1335 116.622 1348.37 121.931 1357.22 132.549C1366.27 143.167 1370.79 158.504 1370.79 178.561V266.455H1346.01V181.51C1346.01 168.532 1343.16 158.406 1337.46 151.13C1331.76 143.659 1322.91 139.923 1310.92 139.923C1299.31 139.923 1289.48 143.953 1281.42 152.015C1273.36 159.881 1269.33 171.285 1269.33 186.229V266.455H1244.55Z"/><path d="M1146.72 269.994C1132.95 269.994 1120.76 266.848 1110.14 260.556C1099.72 254.067 1091.46 245.12 1085.37 233.716C1079.27 222.114 1076.22 208.645 1076.22 193.308C1076.22 177.971 1079.17 164.6 1085.07 153.195C1091.17 141.594 1099.52 132.647 1110.14 126.355C1120.76 119.866 1133.15 116.622 1147.31 116.622C1161.46 116.622 1173.56 119.866 1183.58 126.355C1193.61 132.647 1201.28 141.004 1206.59 151.425C1211.9 161.847 1214.55 173.055 1214.55 185.049C1214.55 187.212 1214.45 189.375 1214.26 191.538C1214.26 193.701 1214.26 196.159 1214.26 198.912H1100.7C1101.29 209.727 1103.75 218.772 1108.08 226.047C1112.6 233.126 1118.2 238.435 1124.89 241.974C1131.77 245.513 1139.05 247.283 1146.72 247.283C1157.53 247.283 1165.99 245.022 1172.08 240.499C1178.18 235.977 1182.8 229.685 1185.94 221.623H1210.42C1207.08 235.19 1200.1 246.693 1189.48 256.131C1178.86 265.373 1164.61 269.994 1146.72 269.994ZM1146.72 138.743C1135.31 138.743 1125.28 142.184 1116.63 149.066C1108.18 155.948 1102.97 165.583 1101 177.971H1190.07C1189.29 165.779 1184.86 156.243 1176.8 149.361C1168.93 142.282 1158.91 138.743 1146.72 138.743Z"/><path d="M934.677 266.455V245.218H972.135V148.771C972.135 143.855 969.776 141.397 965.057 141.397H938.512V120.161H974.2C980.689 120.161 985.899 121.931 989.832 125.47C993.764 129.01 995.731 134.22 995.731 141.102V147.296H996.911C999.27 137.465 1003.69 129.894 1010.18 124.585C1016.87 119.276 1026.11 116.622 1037.91 116.622H1064.75V142.872H1034.37C1022.37 142.872 1013.13 146.903 1006.64 154.965C1000.15 162.83 996.911 172.957 996.911 185.344V245.218H1042.92V266.455H934.677Z"/><path d="M757.801 266.464L822.393 60.001H851.003L915.3 266.464H888.165L873.123 215.143H799.977L784.935 266.464H757.801ZM835.96 94.8047L806.171 194.497H866.929L837.14 94.8047H835.96Z"/><path d="M585.938 266.464V60.001H612.483L659.674 158.218L706.864 60.001H733.409V266.464H709.224V107.782L669.112 191.252H650.235L610.123 108.077V266.464H585.938Z"/><path d="M420.007 266.464V60.001H444.783V244.048H549.487V266.464H420.007Z"/></svg>`;

    logo.appendChild(img);
    logo.appendChild(text);
    container.insertBefore(logo, svg);
}

function removeLMArenaLogo() {
    document.getElementById(IDS.LMARENA_LOGO)?.remove();
    const svg = document.querySelector(`svg[${ATTR.HIDDEN}="1"]`);
    if (svg) { svg.style.display = ''; svg.removeAttribute(ATTR.HIDDEN); }
}

let logoObserver = null;
let logoObserverDebounce = null;
let titleObserver = null;

const TARGET_TITLE = 'LMArena | Choose the best Model';

function forceTitle() {
    if (document.title !== TARGET_TITLE) {
        document.title = TARGET_TITLE;
    }
}

function startLogoObserver() {
    if (logoObserver) return;
    
    if (!titleObserver) {
        titleObserver = new MutationObserver(() => {
            forceTitle();
            applyLMArenaFavicon();
        });
        titleObserver.observe(document.head, {
            childList: true,
            subtree: true,
            characterData: true,
        });
        forceTitle();
        applyLMArenaFavicon();
    }
    
    logoObserver = new MutationObserver(() => {
        if (logoObserverDebounce) return;
        logoObserverDebounce = setTimeout(() => {
            logoObserverDebounce = null;
            if (!document.getElementById(IDS.LMARENA_LOGO)) {
                const svg = findLogoSVG();
                if (svg && !svg.getAttribute(ATTR.HIDDEN)) { svg.style.display = 'none'; svg.setAttribute(ATTR.HIDDEN, '1'); }
                injectLMArenaLogo();
            }
            applyLMArenaSidebarRounding();
            applyLMArenaInputBar();
            applyLMArenaIcons();
            hideYouTubeCTA();
            applyLMArenaFavicon();
            applyLMArenaSidebarIcon();
            injectThemeToggleButton();
            applyLMArenaModalityIcons();
            forceTitle();
        }, 300);
    });
    logoObserver.observe(document.body, { childList: true, subtree: true });
}

function stopLogoObserver() {
    if (logoObserver) { logoObserver.disconnect(); logoObserver = null; }
    if (logoObserverDebounce) { clearTimeout(logoObserverDebounce); logoObserverDebounce = null; }
    if (titleObserver) { titleObserver.disconnect(); titleObserver = null; }
}

async function clickArenaThemeButton(theme) {
    return new Promise(resolve => {
        const menuButton = document.querySelector('[data-sidebar="menu-button"][aria-haspopup="menu"]');
        if (!menuButton) { resolve(false); return; }

        const observer = new MutationObserver(() => {
            const btn = [...document.querySelectorAll('button[role="tab"]')]
                .find(b => b.textContent.trim().toLowerCase() === theme);
            if (btn) {
                observer.disconnect();
                btn.click();
                setTimeout(() => {
                    const stillOpen = document.querySelector('[data-sidebar="menu-button"][data-state="open"]');
                    if (stillOpen) menuButton.click();
                    resolve(true);
                }, 100);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => { observer.disconnect(); resolve(false); }, 3000);
        menuButton.click();
    });
}

function injectThemeToggleButton() {
    if (document.getElementById('arena-fixes-theme-btn')) return;
    const logo = document.getElementById(IDS.LMARENA_LOGO);
    if (!logo) return;
    const menuButton = logo.closest('button, [data-sidebar="menu-button"]');
    if (!menuButton) return;
    const container = menuButton.parentElement;
    if (!container) return;

    container.style.display       = 'flex';
    container.style.flexDirection = 'row';
    container.style.alignItems    = 'center';

    const themeBtn = document.createElement('button');
    themeBtn.id    = 'arena-fixes-theme-btn';
    themeBtn.title = 'Switch to light mode';
    themeBtn.style.cssText = `
        display:inline-flex;align-items:center;justify-content:center;
        width:20px;height:20px;border-radius:4px;border:none;
        background:transparent;color:currentColor;cursor:pointer;
        flex-shrink:0;opacity:0.6;margin-left:auto;margin-right:6px;
        transition:opacity 0.15s ease,background 0.15s ease;
    `;
    themeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>`;

    themeBtn.addEventListener('mouseenter', () => { themeBtn.style.opacity = '1'; themeBtn.style.background = 'rgba(128,128,128,0.15)'; });
    themeBtn.addEventListener('mouseleave', () => { themeBtn.style.opacity = '0.6'; themeBtn.style.background = 'transparent'; });

    let isLight = false;
    themeBtn.addEventListener('click', async e => {
        e.preventDefault(); e.stopPropagation();
        if (!isLight) {
            stopColorWatcher();
            applyLightModeOverride();
            await clickArenaThemeButton('light');
            isLight = true;
            themeBtn.title   = 'Switch to dark mode';
            themeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
        } else {
            removeLightModeOverride();
            await clickArenaThemeButton('dark');
            isLight = false;
            themeBtn.title   = 'Switch to light mode';
            themeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>`;
            setTimeout(() => startColorWatcher(), 300);
        }
    });

    container.insertBefore(themeBtn, menuButton.nextSibling);
}

let colorWatcher = null;

function startColorWatcher() {
    if (colorWatcher) return;
    colorWatcher = new MutationObserver(() => { if (oldThemeEnabled) applyLMArenaTheme(); });
    colorWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
}

function stopColorWatcher() {
    if (colorWatcher) { colorWatcher.disconnect(); colorWatcher = null; }
}

function applyLightModeOverride() {
    if (document.getElementById(IDS.LIGHT_OVERRIDE)) return;
    const style = document.createElement('style');
    style.id = IDS.LIGHT_OVERRIDE;
    style.textContent = `
        html, body { background-color: #ffffff !important; color: #1a1a1a !important; }
        html, html.dark, :root, :root.dark {
            --background: 0 0% 100% !important; --foreground: 0 0% 10% !important;
            --sidebar-background: 0 0% 95% !important; --card: 0 0% 98% !important;
            --popover: 0 0% 100% !important; --surface-primary: 0 0% 100% !important;
            --surface-secondary: 0 0% 95% !important; --surface-raised: 0 0% 93% !important;
            --muted-foreground: 0 0% 40% !important;
        }
        .bg-background { background-color: #ffffff !important; }
        .bg-sidebar { background-color: #f2f2f2 !important; }
        .bg-surface-primary { background-color: #ffffff !important; border-right: none !important; }
        .bg-surface-secondary { background-color: #f2f2f2 !important; }
        .bg-surface-raised { background-color: #ebebeb !important; }
        .bg-card { background-color: #f7f7f7 !important; }
        .bg-popover { background-color: #ffffff !important; }
        main { background-color: #ffffff !important; }
        * { color: #1a1a1a !important; }
        svg { color: #333333 !important; }
        .fill-black { fill: #333333 !important; }
        .dark\\:fill-white { fill: #333333 !important; }
        svg.fill-black, svg.dark\\:fill-white { fill: #333333 !important; }
        [data-sidebar="menu-button"] div.bg-surface-primary { background-color: #e8e8e8 !important; }
        [data-sidebar="menu-button"][data-active="true"] div.bg-surface-primary { background-color: #d8d8d8 !important; }
        img[${ATTR.SIDEBAR_IMG}="1"], #${IDS.LMARENA_LOGO} img { filter: invert(0.8) !important; }
    `;
    document.head.appendChild(style);
}

function removeLightModeOverride() {
    document.getElementById(IDS.LIGHT_OVERRIDE)?.remove();
}

// ─── Auto Scroll ──────────────────────────────────────────────────────────────
let autoScrollPatched = false;
let patchedElements   = new WeakMap(); // el → { origScrollTo, origScrollTop setter }
let scrollObserver    = null;
let scrollObserverDebounce = null;

function patchElementScroll(el) {
    if (patchedElements.has(el)) return;

    const origScrollTo   = el.scrollTo.bind(el);
    const origScrollTop  = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop') ||
                           Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');

    // Override scrollTo
    el.scrollTo = function(...args) {
        // Allow upward / positional scrolls initiated by the user — block downward auto-scrolls
        // We block ALL programmatic scrollTo calls while disabled
        return;
    };

    // Override scrollTop setter
    try {
        Object.defineProperty(el, 'scrollTop', {
            get() {
                return origScrollTop
                    ? origScrollTop.get.call(el)
                    : 0;
            },
            set(_val) {
                // Swallow programmatic scrollTop assignments
                return;
            },
            configurable: true,
        });
    } catch (_) {}

    patchedElements.set(el, { origScrollTo });
}

function unpatchElementScroll(el) {
    if (!patchedElements.has(el)) return;
    const { origScrollTo } = patchedElements.get(el);

    // Restore scrollTo
    el.scrollTo = origScrollTo;

    // Remove our scrollTop override so the prototype takes over again
    try {
        delete el.scrollTop;
    } catch (_) {}

    patchedElements.delete(el);
}

function getScrollableElements() {
    // Grab every element that is actually scrollable
    return [...document.querySelectorAll('*')].filter(el => {
        const style = getComputedStyle(el);
        const overflowY = style.overflowY;
        return (
            (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
            el.scrollHeight > el.clientHeight
        );
    });
}

function patchAllScrollableElements() {
    getScrollableElements().forEach(patchElementScroll);
}

function unpatchAllScrollableElements() {
    // Collect keys from WeakMap isn't possible — track them separately
    document.querySelectorAll('*').forEach(el => {
        if (patchedElements.has(el)) unpatchElementScroll(el);
    });
}

// Patch window-level scroll as well
let origWindowScrollTo = null;
let origWindowScrollBy = null;

function patchWindowScroll() {
    if (origWindowScrollTo) return;
    origWindowScrollTo = window.scrollTo.bind(window);
    origWindowScrollBy = window.scrollBy.bind(window);
    window.scrollTo = () => {};
    window.scrollBy = () => {};
}

function unpatchWindowScroll() {
    if (!origWindowScrollTo) return;
    window.scrollTo = origWindowScrollTo;
    window.scrollBy = origWindowScrollBy;
    origWindowScrollTo = null;
    origWindowScrollBy = null;
}

// Watch for new scrollable elements added by React re-renders
function startScrollObserver() {
    if (scrollObserver) return;
    scrollObserver = new MutationObserver(() => {
        if (scrollObserverDebounce) return;
        scrollObserverDebounce = setTimeout(() => {
            scrollObserverDebounce = null;
            if (autoScrollDisabled) patchAllScrollableElements();
        }, 150);
    });
    scrollObserver.observe(document.body, { childList: true, subtree: true });
}

function stopScrollObserver() {
    if (scrollObserver) { scrollObserver.disconnect(); scrollObserver = null; }
    if (scrollObserverDebounce) { clearTimeout(scrollObserverDebounce); scrollObserverDebounce = null; }
}

function disableAutoScroll() {
    autoScrollDisabled = true;
    patchWindowScroll();
    patchAllScrollableElements();
    startScrollObserver();
}

function enableAutoScroll() {
    autoScrollDisabled = false;
    stopScrollObserver();
    unpatchAllScrollableElements();
    unpatchWindowScroll();
}

// ─── Profile Picture ──────────────────────────────────────────────────────────
let profilePicEnabled  = false;
let profilePicUrl      = '';
let profilePicObserver = null;
let profilePicInterval = null;
let capturedGooglePic  = null;
let googlePicObserver  = null;

function isArenaPlaceholderAvatar(src) {
    if (!src) return false;
    return src.replace(/^https?:\/\/[^/]+/, '').includes('/images/avatars/');
}

function getEffectiveProfilePicUrl() {
    if (profilePicUrl?.startsWith('http')) return profilePicUrl;
    return findProfilePicFromPage();
}

function findProfilePicFromPage() {
    const selectors = [
        'img[src*="googleusercontent.com"]', 'img[src*="lh3.google"]',
        'img[src*="githubusercontent.com"]', 'img[src*="gravatar.com"]',
        'img[src*="avatars.githubusercontent"]', 'img[src*="cdn.discordapp.com"]',
    ];
    for (const sel of selectors) {
        const img = document.querySelector(sel);
        if (img?.src && img.naturalWidth > 0) return img.src;
    }
    for (const storage of [localStorage, sessionStorage]) {
        try {
            for (let i = 0; i < storage.length; i++) {
                const val = storage.getItem(storage.key(i));
                if (!val || val.length > 50000) continue;
                try { const pic = deepFindPic(JSON.parse(val), 3); if (pic) return pic; } catch {}
            }
        } catch {}
    }
    return null;
}

function deepFindPic(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth <= 0) return null;
    const picKeys = ['picture','avatar','image','photo','profile_image','profilePicture','avatarUrl','photoURL','imageUrl'];
    for (const key of picKeys) {
        if (obj[key] && typeof obj[key] === 'string' && obj[key].startsWith('http')) return obj[key];
    }
    for (const subkey of ['user', 'profile']) {
        if (obj[subkey] && typeof obj[subkey] === 'object') {
            const r = deepFindPic(obj[subkey], depth - 1);
            if (r) return r;
        }
    }
    return null;
}

function replaceArenaAvatars() {
    if (!profilePicEnabled) return;
    const url = getEffectiveProfilePicUrl();
    if (!url) return;

    document.querySelectorAll('span.relative.flex.overflow-hidden.rounded-full').forEach(span => {
        if (span.getAttribute(ATTR.PFP) === '1') return;
        const img = span.querySelector('img.aspect-square');
        if (!img || !isArenaPlaceholderAvatar(img.src)) return;
        img.setAttribute(ATTR.ORIGINAL_SRC, img.src);
        img.src = url; img.style.objectFit = 'cover';
        span.setAttribute(ATTR.PFP, '1');
    });

    document.querySelectorAll('img[src*="/images/avatars/"]').forEach(img => {
        if (img.getAttribute(ATTR.PFP) === '1') return;
        img.setAttribute(ATTR.ORIGINAL_SRC, img.src);
        img.setAttribute(ATTR.PFP, '1');
        img.src = url; img.style.objectFit = 'cover';
    });
}

async function enableProfilePicFix() {
    profilePicEnabled = true;
    if (!profilePicUrl?.startsWith('http')) {
        if (capturedGooglePic) {
            profilePicUrl = capturedGooglePic;
        } else {
            const data = await new Promise(resolve =>
                chrome.storage.local.get([STORAGE_KEYS.CAPTURED_GOOGLE_PIC], resolve)
            );
            if (data[STORAGE_KEYS.CAPTURED_GOOGLE_PIC]) {
                profilePicUrl = capturedGooglePic = data[STORAGE_KEYS.CAPTURED_GOOGLE_PIC];
            }
        }
    }
    replaceArenaAvatars();

    if (!profilePicObserver) {
        let pfpDebounce = null;
        profilePicObserver = new MutationObserver(() => {
            if (pfpDebounce) return;
            pfpDebounce = setTimeout(() => {
                pfpDebounce = null;
                if (!profilePicUrl?.startsWith('http') && capturedGooglePic) profilePicUrl = capturedGooglePic;
                replaceArenaAvatars();
            }, 200);
        });
        profilePicObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    }
    if (!profilePicInterval) {
        profilePicInterval = setInterval(() => {
            if (!profilePicUrl?.startsWith('http') && capturedGooglePic) profilePicUrl = capturedGooglePic;
            replaceArenaAvatars();
        }, 3000);
    }
}

function disableProfilePicFix() {
    profilePicEnabled = false;
    if (profilePicObserver) { profilePicObserver.disconnect(); profilePicObserver = null; }
    if (profilePicInterval) { clearInterval(profilePicInterval); profilePicInterval = null; }

    document.querySelectorAll(`[${ATTR.PFP}="1"]`).forEach(el => {
        if (el.tagName === 'IMG') {
            const orig = el.getAttribute(ATTR.ORIGINAL_SRC);
            if (orig) { el.src = orig; el.removeAttribute(ATTR.ORIGINAL_SRC); }
            el.removeAttribute(ATTR.PFP); el.style.objectFit = '';
        } else {
            el.removeAttribute(ATTR.PFP);
            const img = el.querySelector(`img[${ATTR.PFP}]`);
            if (img) {
                const orig = img.getAttribute(ATTR.ORIGINAL_SRC);
                if (orig) { img.src = orig; img.removeAttribute(ATTR.ORIGINAL_SRC); }
                img.removeAttribute(ATTR.PFP); img.style.objectFit = '';
            }
        }
    });
}

function startGooglePicCapture() {
    if (googlePicObserver) return;

    const checkImg = img => {
        if (!img?.src) return;
        if (!['googleusercontent.com','lh3.google','lh4.google','lh5.google','lh6.google']
            .some(h => img.src.includes(h))) return;
        const url = img.src;
        if (capturedGooglePic === url) return;
        capturedGooglePic = url;
        chrome.storage.local.set({ [STORAGE_KEYS.CAPTURED_GOOGLE_PIC]: url, [STORAGE_KEYS.PROFILE_PIC_URL]: url });
        if (!profilePicUrl?.startsWith('http')) profilePicUrl = url;
        if (profilePicEnabled) replaceArenaAvatars();
    };

    document.querySelectorAll('img').forEach(checkImg);

    googlePicObserver = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.target.tagName === 'IMG') checkImg(mutation.target);
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.tagName === 'IMG') { checkImg(node); node.addEventListener('load', () => checkImg(node), { once: true }); }
                node.querySelectorAll?.('img').forEach(img => { checkImg(img); img.addEventListener('load', () => checkImg(img), { once: true }); });
            }
        }
    });
    googlePicObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
}

// ─── State & init ─────────────────────────────────────────────────────────────
let oldThemeEnabled   = false;
let enabledState      = false;
let autoScrollDisabled = false;
let refreshScheduled  = false;

function refreshIfEnabled() {
    if (refreshScheduled) return;
    refreshScheduled = true;
    requestAnimationFrame(() => {
        if (enabledState) enableBottomCopyButtons();
        refreshScheduled = false;
    });
}

chrome.storage.local.get([
    STORAGE_KEYS.BOTTOM_COPY_ENABLED,
    STORAGE_KEYS.OLD_THEME_ENABLED,
    STORAGE_KEYS.AUTO_SCROLL_DISABLED,
    STORAGE_KEYS.PROFILE_PIC_ENABLED,
    STORAGE_KEYS.PROFILE_PIC_URL,
    STORAGE_KEYS.RAW_MARKDOWN_ENABLED,
], data => {
    enabledState       = !!data[STORAGE_KEYS.BOTTOM_COPY_ENABLED];
    oldThemeEnabled    = !!data[STORAGE_KEYS.OLD_THEME_ENABLED];
    autoScrollDisabled = !!data[STORAGE_KEYS.AUTO_SCROLL_DISABLED];
    profilePicEnabled  = !!data[STORAGE_KEYS.PROFILE_PIC_ENABLED];
    profilePicUrl      = data[STORAGE_KEYS.PROFILE_PIC_URL] || '';
    rawMarkdownEnabled = !!data[STORAGE_KEYS.RAW_MARKDOWN_ENABLED];

    if (enabledState)       enableBottomCopyButtons();
    if (oldThemeEnabled)    applyLMArenaTheme();
    if (autoScrollDisabled) disableAutoScroll();
    if (profilePicEnabled)  enableProfilePicFix();
    if (rawMarkdownEnabled) enableRawMarkdown();

    startGooglePicCapture();
});

const observer = new MutationObserver(refreshIfEnabled);
observer.observe(document.body, { childList: true, subtree: true });

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (changes[STORAGE_KEYS.BOTTOM_COPY_ENABLED]) {
        enabledState = !!changes[STORAGE_KEYS.BOTTOM_COPY_ENABLED].newValue;
        enabledState ? enableBottomCopyButtons() : disableBottomCopyButtons();
    }
    if (changes[STORAGE_KEYS.OLD_THEME_ENABLED]) {
        oldThemeEnabled = !!changes[STORAGE_KEYS.OLD_THEME_ENABLED].newValue;
        oldThemeEnabled ? applyLMArenaTheme() : removeLMArenaTheme();
    }
    if (changes[STORAGE_KEYS.AUTO_SCROLL_DISABLED]) {
        autoScrollDisabled = !!changes[STORAGE_KEYS.AUTO_SCROLL_DISABLED].newValue;
        autoScrollDisabled ? disableAutoScroll() : enableAutoScroll();
    }
    if (changes[STORAGE_KEYS.PROFILE_PIC_ENABLED]) {
        profilePicEnabled = !!changes[STORAGE_KEYS.PROFILE_PIC_ENABLED].newValue;
        profilePicEnabled ? enableProfilePicFix() : disableProfilePicFix();
    }
    if (changes[STORAGE_KEYS.PROFILE_PIC_URL]) {
        profilePicUrl = changes[STORAGE_KEYS.PROFILE_PIC_URL].newValue || '';
        if (profilePicEnabled) { disableProfilePicFix(); enableProfilePicFix(); }
    }
    if (changes[STORAGE_KEYS.RAW_MARKDOWN_ENABLED]) {
        rawMarkdownEnabled = !!changes[STORAGE_KEYS.RAW_MARKDOWN_ENABLED].newValue;
        rawMarkdownEnabled ? enableRawMarkdown() : disableRawMarkdown();
    }
});

// ─── Message listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message?.type) {
        case MSG.GET_LATEST_USER_MESSAGE:
            sendResponse({ text: getBottomMostUserMessageText() });
            return true;

        case MSG.COPY_LATEST_USER_MESSAGE:
            sendResponse({ success: copyBottomMostUserMessage() });
            return true;

        case MSG.REFRESH_COPY_BUTTONS:
            enabledState ? enableBottomCopyButtons() : disableBottomCopyButtons();
            sendResponse({ ok: true });
            return true;

        case MSG.REFRESH_OLD_THEME:
            oldThemeEnabled ? applyLMArenaTheme() : removeLMArenaTheme();
            sendResponse({ ok: true });
            return true;

        case MSG.REFRESH_AUTO_SCROLL:
            autoScrollDisabled ? disableAutoScroll() : enableAutoScroll();
            sendResponse({ ok: true });
            return true;

        case MSG.REFRESH_PROFILE_PIC:
            chrome.storage.local.get([STORAGE_KEYS.PROFILE_PIC_ENABLED, STORAGE_KEYS.PROFILE_PIC_URL], data => {
                profilePicEnabled = !!data[STORAGE_KEYS.PROFILE_PIC_ENABLED];
                profilePicUrl     = data[STORAGE_KEYS.PROFILE_PIC_URL] || '';
                profilePicEnabled ? (disableProfilePicFix(), enableProfilePicFix()) : disableProfilePicFix();
            });
            sendResponse({ ok: true });
            return true;

        case MSG.REFRESH_RAW_MARKDOWN:
            rawMarkdownEnabled ? enableRawMarkdown() : disableRawMarkdown();
            sendResponse({ ok: true });
            return true;
    }
});