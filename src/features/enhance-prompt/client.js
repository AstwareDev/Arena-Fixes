const ENHANCE_STYLE_ID = "arena-fixes-enhance-style";

let enhancePromptEnabled = false;
let currentReasoningEffort = "instant";
let askQuestionsEnabled = true;
let enhanceObserver = null;

// ── Effort config ──────────────────────────────────────────────────────────
const EFFORT_OPTIONS = [
    {
        value: "high",
        label: "High",
        icon: `<svg class="af-effort-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
            <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
            <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
            <path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/>
            <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/>
            <path d="M3.477 10.896a4 4 0 0 1 .585-.396"/>
            <path d="M19.938 10.5a4 4 0 0 1 .585.396"/>
            <path d="M6 18a4 4 0 0 1-1.967-.516"/>
            <path d="M19.967 17.484A4 4 0 0 1 18 18"/>
        </svg>`
    },
    {
        value: "medium",
        label: "Medium",
        icon: `<svg class="af-effort-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"/>
        </svg>`
    },
    {
        value: "low",
        label: "Low",
        icon: `<svg class="af-effort-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"/>
        </svg>`
    },
    {
        value: "instant",
        label: "Instant",
        icon: `<svg class="af-effort-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/>
        </svg>`
    }
];

// ── Styles ─────────────────────────────────────────────────────────────────
function injectEnhanceStyle() {
    if (document.getElementById(ENHANCE_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = ENHANCE_STYLE_ID;
    style.textContent = `
        .af-enhance-wrap {
            display: inline-flex;
            align-items: center;
            position: relative;
            flex-shrink: 0;
        }
        .arena-fixes-enhance-btn {
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
            font-size: 15px;
            line-height: 1;
            position: relative;
        }
        .arena-fixes-enhance-btn:hover {
            color: hsl(var(--text-primary, 0 0% 92%));
            background: rgba(255,255,255,0.05);
        }
        .arena-fixes-enhance-btn.af-enhancing {
            color: hsl(var(--text-primary, 0 0% 92%));
            pointer-events: none;
        }
        .arena-fixes-enhance-btn.af-enhancing .af-icon {
            animation: af-spin 1s linear infinite;
        }
        @keyframes af-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .arena-fixes-enhance-btn .af-tooltip {
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
        .arena-fixes-enhance-btn:hover .af-tooltip { opacity: 1; }
        .af-effort-caret {
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
        .af-effort-caret:hover {
            color: hsl(var(--text-primary, 0 0% 92%));
            background: rgba(255,255,255,0.05);
        }
        .af-effort-caret svg { width: 10px; height: 10px; pointer-events: none; }
        .af-effort-menu {
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
            animation: af-menu-in 0.15s cubic-bezier(0.16,1,0.3,1);
        }
        .af-effort-menu.af-open { display: block; }
        @keyframes af-menu-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .af-effort-menu-label {
            font-size: 10px;
            font-weight: 600;
            letter-spacing: 0.07em;
            text-transform: uppercase;
            color: #555;
            padding: 6px 10px 4px;
            font-family: 'Inter', sans-serif;
        }
        .af-effort-item {
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
        .af-effort-item:hover { background: rgba(255,255,255,0.06); color: #eaeaea; }
        .af-effort-item.af-selected { background: rgba(255,255,255,0.08); color: #eaeaea; }
        .af-effort-icon { width: 15px; height: 15px; flex-shrink: 0; }
        .af-menu-divider { height: 1px; background: #222; margin: 4px 6px; }
        .af-menu-toggle-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            width: 100%;
            padding: 7px 10px;
            border-radius: 7px;
            cursor: pointer;
            transition: background 0.1s ease;
            box-sizing: border-box;
        }
        .af-menu-toggle-row:hover { background: rgba(255,255,255,0.04); }
        .af-menu-toggle-label {
            display: flex;
            align-items: center;
            gap: 7px;
            font-size: 13px;
            font-weight: 500;
            font-family: 'Inter', system-ui, sans-serif;
            color: #888;
            white-space: nowrap;
        }
        .af-menu-toggle-label svg { width: 15px; height: 15px; flex-shrink: 0; }
        .af-menu-toggle-row:hover .af-menu-toggle-label { color: #ccc; }
        .af-mini-switch { position: relative; width: 28px; height: 16px; flex-shrink: 0; }
        .af-mini-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
        .af-mini-slider {
            position: absolute;
            inset: 0;
            background: #333;
            border-radius: 16px;
            transition: background 0.2s ease;
            pointer-events: none;
        }
        .af-mini-slider::before {
            content: '';
            position: absolute;
            width: 11px;
            height: 11px;
            left: 2.5px;
            top: 2.5px;
            background: #777;
            border-radius: 50%;
            transition: transform 0.2s ease, background 0.2s ease;
        }
        .af-mini-switch input:checked + .af-mini-slider { background: #444; }
        .af-mini-switch input:checked + .af-mini-slider::before { transform: translateX(12px); background: #ccc; }

        /* ── Question Bar ── */
        .af-question-bar {
            position: relative;
            width: 100%;
            background: #1c1c1e;
            border: 1px solid #313131;
            border-radius: 10px;
            overflow: hidden;
            animation: af-bar-in 0.22s cubic-bezier(0.16, 1, 0.3, 1);
            font-family: 'Inter', system-ui, sans-serif;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            margin-bottom: 8px;
        }
        @keyframes af-bar-in { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
        .af-question-bar-accent { height: 1px; background: #313131; }
        .af-question-bar-inner { padding: 12px 14px 12px; display: flex; flex-direction: column; gap: 10px; }
        .af-question-bar-header { display: flex; align-items: center; gap: 8px; }
        .af-question-bar-badge {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 2px 8px;
            border-radius: 20px;
            background: rgba(255,255,255,0.05);
            border: 1px solid #333;
            font-size: 10px;
            font-weight: 600;
            letter-spacing: 0.07em;
            text-transform: uppercase;
            color: #777;
            flex-shrink: 0;
        }
        .af-question-bar-badge svg { width: 9px; height: 9px; flex-shrink: 0; opacity: 0.7; }
        .af-question-bar-dismiss {
            margin-left: auto;
            width: 20px;
            height: 20px;
            border-radius: 5px;
            background: transparent;
            border: none;
            cursor: pointer;
            color: #555;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            transition: background 0.12s, color 0.12s;
            padding: 0;
            flex-shrink: 0;
        }
        .af-question-bar-dismiss:hover { background: rgba(255,255,255,0.06); color: #bbb; }
        .af-question-bar-question { font-size: 13px; font-weight: 500; color: #d0d0d0; line-height: 1.5; }
        .af-question-bar-input-wrap { display: flex; align-items: flex-end; gap: 7px; }
        .af-question-bar-input {
            flex: 1;
            background: #111;
            border: 1px solid #282828;
            border-radius: 7px;
            padding: 8px 11px;
            font-size: 13px;
            font-family: inherit;
            color: #e0e0e0;
            resize: none;
            outline: none;
            min-height: 38px;
            max-height: 110px;
            overflow-y: auto;
            transition: border-color 0.15s ease;
            box-sizing: border-box;
            line-height: 1.5;
        }
        .af-question-bar-input::placeholder { color: #3e3e3e; }
        .af-question-bar-input:focus { border-color: #3e3e3e; }
        .af-question-bar-submit {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            height: 34px;
            padding: 0 12px;
            border-radius: 7px;
            border: 1px solid #323232;
            background: #1e1e1e;
            color: #888;
            font-size: 12px;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            flex-shrink: 0;
            transition: background 0.12s, color 0.12s, border-color 0.12s;
            white-space: nowrap;
        }
        .af-question-bar-submit:hover:not(:disabled) { background: #262626; color: #ddd; border-color: #404040; }
        .af-question-bar-submit:disabled { opacity: 0.3; cursor: not-allowed; }
        .af-question-bar-hint { font-size: 10.5px; color: #3a3a3a; }
        .af-question-bar-hint kbd {
            display: inline-block;
            padding: 1px 4px;
            border-radius: 3px;
            background: rgba(255,255,255,0.04);
            border: 1px solid #2a2a2a;
            font-size: 10px;
            font-family: inherit;
            color: #505050;
        }
    `;
    document.head.appendChild(style);
}

// ── Question UI ─────────────────────────────────────────────────────────────
function showQuestionUI(textarea, questionText, onReply, onDismiss) {
    const existingBar = document.getElementById("af-question-bar-instance");
    if (existingBar) existingBar.remove();

    const bar = document.createElement("div");
    bar.className = "af-question-bar";
    bar.id = "af-question-bar-instance";

    bar.innerHTML = `
        <div class="af-question-bar-accent"></div>
        <div class="af-question-bar-inner">
            <div class="af-question-bar-header">
                <div class="af-question-bar-badge">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                    Question from AI
                </div>
                <button class="af-question-bar-dismiss" aria-label="Dismiss">✕</button>
            </div>
            <div class="af-question-bar-question">${questionText}</div>
            <div class="af-question-bar-input-wrap">
                <textarea class="af-question-bar-input" placeholder="Type your answer…" rows="1"></textarea>
                <button class="af-question-bar-submit" disabled>Refine ↵</button>
            </div>
            <div class="af-question-bar-hint">
                <kbd>Ctrl</kbd> <kbd>Enter</kbd> to submit · <kbd>Esc</kbd> to dismiss
            </div>
        </div>
    `;

    const container = textarea.closest("form") || textarea.parentNode;
    container.insertBefore(bar, container.firstChild);

    const input = bar.querySelector(".af-question-bar-input");
    const submitBtn = bar.querySelector(".af-question-bar-submit");
    const dismissBtn = bar.querySelector(".af-question-bar-dismiss");

    const autoResize = () => {
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 110) + "px";
    };
    input.addEventListener("input", () => { submitBtn.disabled = !input.value.trim(); autoResize(); });

    const dismiss = () => { bar.remove(); onDismiss?.(); };
    const submit = () => {
        const answer = input.value.trim();
        if (!answer) return;
        bar.remove();
        onReply(answer);
    };

    input.addEventListener("keydown", e => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (!submitBtn.disabled) submit(); }
        if (e.key === "Escape") dismiss();
    });
    dismissBtn.addEventListener("click", dismiss);
    submitBtn.addEventListener("click", submit);
    requestAnimationFrame(() => input.focus());
}

// ── Textarea helper ─────────────────────────────────────────────────────────
function setTextareaValue(textarea, value) {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    if (nativeSetter) nativeSetter.call(textarea, value);
    else textarea.value = value;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
}

const MERCURY_API_URL = "https://router.twangymoney.xyz/v1/chat/completions";
const MERCURY_API_KEY = "ArenaFixes-Mercury-2";

// ── Mercury API ─────────────────────────────────────────────────────────────
async function enhanceWithMercury(textarea, originalPrompt, onUpdate, runEnhanceFn) {
    const effortMap = { instant: "Instant", low: "Low", medium: "Medium", high: "High" };
    const apiEffort = effortMap[currentReasoningEffort] || "Instant";

    const askQuestionsInstruction = askQuestionsEnabled
        ? `If and only if the prompt is genuinely ambiguous in a way that would fundamentally change the rewrite, you may ask ONE focused clarifying question. To do so, respond with ONLY a JSON object on a single line: {"question": "your question here"} — nothing else before or after it. Do NOT ask questions for short, casual, clear, or complete prompts. When in doubt, just enhance directly.`
        : `Never ask clarifying questions under any circumstances. Always enhance the prompt directly, making reasonable assumptions about intent.`;

    const systemPrompt = `You are a professional prompt engineer. Your sole purpose is to rewrite user prompts to be clearer, more specific, and more effective for AI chatbots. Do not say anything other than the rewritten prompt. Do not include any explanations, notes, apologies, or stuff like "PROMPT:". Always enhance the prompt to the best of your ability based on the information given. If reasoning effort is set to High (currently: ${apiEffort}), you should make the prompt more effective, structured, clear, professional, premium, well-formatted to get the best results. ${askQuestionsInstruction}`;

    const res = await fetch(MERCURY_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${MERCURY_API_KEY}`,
            "Accept": "text/event-stream"
        },
        body: JSON.stringify({
            model: "mercury-2",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: originalPrompt }
            ],
            max_tokens: 7000,
            stream: true,
            reasoning_effort: apiEffort
        })
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`API Error ${res.status}: ${text.slice(0, 200)}`);
    }

    if (!res.body) {
        throw new Error("No response body received from Mercury API");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let currentText = "";
    let buffer = "";
    let streamDone = false;

    while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith("data:")) continue;

            const data = line.slice(5).trim();
            if (!data) continue;

            if (data === "[DONE]") {
                streamDone = true;
                break;
            }

            try {
                const json = JSON.parse(data);
                const delta = json?.choices?.[0]?.delta?.content;
                const isDiffusion = !!json?.diffusion_meta?.diffusion_content;

                if (typeof delta !== "string") continue;

                // Mercury diffusion chunks contain the full current draft,
                // not just token-by-token increments.
                currentText = isDiffusion ? delta : currentText + delta;

                if (askQuestionsEnabled) {
                    let parsedQuestion = null;
                    try {
                        const trimmed = currentText.trim();
                        if (trimmed.startsWith("{") && trimmed.includes('"question"')) {
                            const parsed = JSON.parse(trimmed);
                            if (parsed?.question && typeof parsed.question === "string") {
                                parsedQuestion = parsed.question;
                            }
                        }
                    } catch (_) {}

                    if (parsedQuestion) {
                        showQuestionUI(
                            textarea,
                            parsedQuestion,
                            answer => runEnhanceFn(`${originalPrompt}\n\n[User clarification: ${answer}]`),
                            null
                        );
                        onUpdate?.(originalPrompt);
                        return originalPrompt;
                    }
                }

                onUpdate?.(currentText);
            } catch (_) {}
        }
    }

    return currentText.trim();
}

// ── Effort Dropdown ─────────────────────────────────────────────────────────
function buildEffortDropdown(wrap) {
    const menu = document.createElement("div");
    menu.className = "af-effort-menu";

    const effortLabel = document.createElement("div");
    effortLabel.className = "af-effort-menu-label";
    effortLabel.textContent = "Reasoning Effort";
    menu.appendChild(effortLabel);

    EFFORT_OPTIONS.forEach(opt => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "af-effort-item" + (opt.value === currentReasoningEffort ? " af-selected" : "");
        btn.dataset.value = opt.value;
        btn.innerHTML = opt.icon + `<span>${opt.label}</span>`;
        btn.addEventListener("click", e => {
            e.stopPropagation();
            setEffort(opt.value);
            closeMenu(menu);
        });
        menu.appendChild(btn);
    });

    const divider = document.createElement("div");
    divider.className = "af-menu-divider";
    menu.appendChild(divider);

    const optionsLabel = document.createElement("div");
    optionsLabel.className = "af-effort-menu-label";
    optionsLabel.textContent = "Options";
    menu.appendChild(optionsLabel);

    const toggleRow = document.createElement("div");
    toggleRow.className = "af-menu-toggle-row";
    toggleRow.innerHTML = `
        <span class="af-menu-toggle-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
            </svg>
            Ask Questions
        </span>
        <label class="af-mini-switch" title="Ask clarifying questions before enhancing">
            <input type="checkbox" id="af-ask-questions-toggle" ${askQuestionsEnabled ? "checked" : ""}>
            <span class="af-mini-slider"></span>
        </label>
    `;

    toggleRow.addEventListener("click", e => {
        e.stopPropagation();
        const checkbox = toggleRow.querySelector("input[type=checkbox]");
        checkbox.checked = !checkbox.checked;
        askQuestionsEnabled = checkbox.checked;
        chrome.storage.local.set({ askQuestionsEnabled });
    });

    menu.appendChild(toggleRow);
    wrap.appendChild(menu);
    return menu;
}

function setEffort(value) {
    currentReasoningEffort = value;
    chrome.storage.local.set({ reasoningEffort: value });
    document.querySelectorAll(".af-effort-item").forEach(btn => {
        btn.classList.toggle("af-selected", btn.dataset.value === value);
    });
}

function openMenu(menu) { menu.classList.add("af-open"); }
function closeMenu(menu) { menu.classList.remove("af-open"); }
function toggleMenu(menu) {
    if (menu.classList.contains("af-open")) closeMenu(menu);
    else openMenu(menu);
}

// ── Build the full button group ─────────────────────────────────────────────
function buildEnhanceButton(textarea) {
    const wrap = document.createElement("div");
    wrap.className = "af-enhance-wrap";

    const btn = document.createElement("button");
    btn.className = "arena-fixes-enhance-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Enhance prompt with Mercury 2");
    btn.innerHTML = `<span class="af-icon" aria-hidden="true">✦</span><span class="af-tooltip">Enhance Prompt</span>`;

    const caret = document.createElement("button");
    caret.className = "af-effort-caret";
    caret.type = "button";
    caret.setAttribute("aria-label", "Reasoning effort");
    caret.innerHTML = `<svg viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l4 4 4-4"/></svg>`;

    const menu = buildEffortDropdown(wrap);

    caret.addEventListener("click", e => {
        e.stopPropagation();
        const cb = menu.querySelector("#af-ask-questions-toggle");
        if (cb) cb.checked = askQuestionsEnabled;
        toggleMenu(menu);
    });

    document.addEventListener("click", e => {
        if (!wrap.contains(e.target)) closeMenu(menu);
    }, true);

    const icon = btn.querySelector(".af-icon");

    const resetState = () => { icon.textContent = "✦"; icon.style.color = ""; btn.classList.remove("af-enhancing"); };
    const setError = () => { icon.textContent = "✕"; icon.style.color = "#ef4444"; setTimeout(resetState, 2000); };

    const runEnhance = async textToEnhance => {
        btn.classList.add("af-enhancing");
        icon.textContent = "◌";
        try {
            await enhanceWithMercury(textarea, textToEnhance, current => {
                if (current) setTextareaValue(textarea, current);
            }, runEnhance);
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
        } catch (err) {
            console.error("[Arena Fixes] Enhance Prompt failed:", err);
            setError();
            return;
        }
        resetState();
    };

    btn.addEventListener("click", () => {
        const original = textarea.value.trim();
        if (original) runEnhance(original);
    });

    wrap.appendChild(btn);
    wrap.appendChild(caret);
    return wrap;
}

// ── Inject / remove ─────────────────────────────────────────────────────────
function injectEnhanceButton() {
    const textareas = document.querySelectorAll(
        "textarea[name='message'], textarea[placeholder*='Ask'], textarea[data-testid='textbox']"
    );
    textareas.forEach(textarea => {
        const form = textarea.closest("form") || textarea.parentNode;
        if (!form || form.querySelector(".arena-fixes-enhance-btn")) return;
        const wrap = buildEnhanceButton(textarea);
        const submitBtn = form.querySelector("button[type='submit'], button[aria-label*='Send'], button[id*='submit']");
        if (submitBtn?.parentNode) submitBtn.parentNode.insertBefore(wrap, submitBtn);
        else textarea.parentNode?.insertBefore(wrap, textarea.nextSibling);
    });
}

function removeEnhanceButton() {
    document.querySelectorAll(".af-enhance-wrap").forEach(el => el.remove());
    document.querySelectorAll(".arena-fixes-enhance-btn").forEach(btn => btn.remove());
    document.getElementById("af-question-bar-instance")?.remove();
}

function enableEnhancePrompt() {
    injectEnhanceStyle();
    injectEnhanceButton();
    if (!enhanceObserver) {
        let debounce = null;
        enhanceObserver = new MutationObserver(records => {
            if (debounce) return;
            const hasAddedNodes = records.some(r => r.addedNodes.length > 0);
            if (!hasAddedNodes) return;
            debounce = setTimeout(() => { debounce = null; injectEnhanceButton(); }, 500);
        });
        enhanceObserver.observe(document.body, { childList: true, subtree: true });
    }
}

function disableEnhancePrompt() {
    removeEnhanceButton();
    if (enhanceObserver) { enhanceObserver.disconnect(); enhanceObserver = null; }
    document.getElementById(ENHANCE_STYLE_ID)?.remove();
}

// ── Init ────────────────────────────────────────────────────────────────────
chrome.storage.local.get(["enhancePromptEnabled", "reasoningEffort", "askQuestionsEnabled"], data => {
    enhancePromptEnabled = !!data.enhancePromptEnabled;
    currentReasoningEffort = data.reasoningEffort || "instant";
    askQuestionsEnabled = data.askQuestionsEnabled !== undefined ? !!data.askQuestionsEnabled : true;
    if (enhancePromptEnabled) enableEnhancePrompt();
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if ("enhancePromptEnabled" in changes) {
        enhancePromptEnabled = !!changes.enhancePromptEnabled.newValue;
        enhancePromptEnabled ? enableEnhancePrompt() : disableEnhancePrompt();
    }
    if ("reasoningEffort" in changes) {
        currentReasoningEffort = changes.reasoningEffort.newValue || "instant";
        document.querySelectorAll(".af-effort-item").forEach(btn => {
            btn.classList.toggle("af-selected", btn.dataset.value === currentReasoningEffort);
        });
    }
    if ("askQuestionsEnabled" in changes) {
        askQuestionsEnabled = !!changes.askQuestionsEnabled.newValue;
        const cb = document.querySelector("#af-ask-questions-toggle");
        if (cb) cb.checked = askQuestionsEnabled;
    }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "REFRESH_ENHANCE_PROMPT") return;
    chrome.storage.local.get(["enhancePromptEnabled", "reasoningEffort", "askQuestionsEnabled"], data => {
        enhancePromptEnabled = !!data.enhancePromptEnabled;
        currentReasoningEffort = data.reasoningEffort || "instant";
        askQuestionsEnabled = data.askQuestionsEnabled !== undefined ? !!data.askQuestionsEnabled : true;
        enhancePromptEnabled ? enableEnhancePrompt() : disableEnhancePrompt();
    });
    sendResponse({ ok: true });
    return true;
});