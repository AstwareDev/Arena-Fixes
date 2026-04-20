const CHAT_FIXES_ACTIONS = {
    detectBrowser() {
        const ua = navigator.userAgent || "";
        if (navigator.brave || ua.includes("Brave")) return "Brave";
        if (ua.includes("Edge")) return "Edge";
        if (ua.includes("Chrome")) return "Chrome";
        return "Unknown";
    },

    async refreshLatestUserMessagePreview(UI, App) {
        const tab = await ChromeAPI.getArenaTab(App);
        if (!tab) { UI.setLatestPreview("Open arena.ai to load the latest user message."); return; }
        const res = await ChromeAPI.sendMessageToTab(tab.id, { type: MSG.GET_LATEST_USER_MESSAGE });
        const text = res?.text?.trim() || "";
        UI.setLatestPreview(text ? text.slice(0, 220) : "No user message found.");
    },

    async copyLatestUserMessage(UI, App) {
        const tab = await ChromeAPI.getArenaTab(App);
        if (!tab) { UI.setStatus("Open arena.ai first.", "warning"); return; }
        const res = await ChromeAPI.sendMessageToTab(tab.id, { type: MSG.COPY_LATEST_USER_MESSAGE });
        if (res?.success) { UI.setStatus("Latest user message copied.", "success"); return; }
        const textRes = await ChromeAPI.sendMessageToTab(tab.id, { type: MSG.GET_LATEST_USER_MESSAGE });
        const text = textRes?.text?.trim() || "";
        if (!text) { UI.setStatus("No user message found.", "warning"); return; }
        try {
            await navigator.clipboard.writeText(text);
            UI.setStatus("Latest user message copied.", "success");
        } catch { UI.setStatus("Could not copy message.", "error"); }
    },

    async copyCommands(UI) {
        try {
            await navigator.clipboard.writeText(NETWORK_COMMANDS);
            UI.setStatus("Commands copied to clipboard.", "success");
        } catch { UI.setStatus("Failed to copy commands.", "error"); }
    },

    async runUnstuckChat(UI, App) {
        const tab = await ChromeAPI.getArenaTab(App);
        if (!tab) { UI.setStatus("Open arena.ai first.", "warning"); return; }
        UI.setStatus("Applying unstuck fix…");
        try {
            const result = await ChromeAPI.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    let inputFound = false, buttonsUnlocked = 0;
                    const ta = document.querySelector("textarea");
                    if (ta) {
                        ta.removeAttribute("disabled");
                        ta.placeholder = "Unlocked by Arena Fixes";
                        ta.style.border = "2px solid #00ff00";
                        inputFound = true;
                    }
                    document.querySelectorAll("button:disabled").forEach(btn => {
                        btn.removeAttribute("disabled");
                        btn.classList.remove("pointer-events-none", "cursor-not-allowed", "opacity-50");
                        btn.style.cssText += "cursor:pointer;opacity:1;border:1px solid red";
                        buttonsUnlocked++;
                    });
                    return { inputFound, buttonsUnlocked };
                }
            });
            const msg = (!result?.inputFound && result?.buttonsUnlocked === 0)
                ? "Arena Fixes: Unstuck Chat\n\nNo disabled elements found.\n\nTry:\n1. Make sure you are in an active chat.\n2. Reload the page and try again.\n3. Try Restore Skip or Remove Overlay instead."
                : `Arena Fixes: UI unlocked.\n\nInput found: ${result.inputFound ? "Yes" : "No"}\nButtons unlocked: ${result.buttonsUnlocked}\n\nIf still stuck, try Restore Skip or reload the page.`;
            await ChromeAPI.showPageAlert(tab.id, msg);
            UI.setStatus("Unstuck Chat applied.", "success");
        } catch (err) {
            UI.setStatus("Unstuck Chat failed.", "error");
            await ChromeAPI.showPageAlert(tab.id, `Arena Fixes: Unstuck Chat failed.\n\nError: ${err.message || err}`);
        }
    },

    async runRestoreSkipButton(UI, App) {
        const tab = await ChromeAPI.getArenaTab(App);
        if (!tab) { UI.setStatus("Open arena.ai first.", "warning"); return; }
        UI.setStatus("Restoring Skip button…");
        try {
            await ChromeAPI.executeScript({
                target: { tabId: tab.id },
                world: "MAIN",
                func: () => {
                    const findSkipButton = () =>
                        [...document.querySelectorAll("button")].find(btn => {
                            if (btn.id === "arena-fixes-skip-button" || btn.closest("#arena-fixes-skip-toolbar")) return false;
                            return [...btn.querySelectorAll("span")].some(s => s.textContent.trim() === "Skip");
                        });
                    const unhideParents = el => {
                        let node = el.parentElement;
                        while (node && node !== document.body) {
                            if (node.classList.contains("hidden")) { node.classList.remove("hidden"); node.style.display = "flex"; }
                            const cs = window.getComputedStyle(node);
                            if (cs.display === "none") node.style.display = "flex";
                            if (cs.visibility === "hidden") node.style.visibility = "visible";
                            node = node.parentElement;
                        }
                    };
                    const getChatId = () => (window.location.pathname.match(/\/c\/([a-f0-9-]+)/) || [])[1] || null;
                    const getReactFiber = el => {
                        const key = Object.keys(el).find(k => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
                        return key ? el[key] : null;
                    };
                    const findMessageIds = () => {
                        const cards = [...document.querySelectorAll("[aria-roledescription='slide']")]
                            .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
                        if (!cards.length) return null;
                        let cur = getReactFiber(cards[0]);
                        for (let d = 0; d < 40 && cur; d++) {
                            const p = cur.memoizedProps || cur.pendingProps || {};
                            if (p.messageA?.id && p.messageB?.id) return {
                                messageAId: p.messageA.id, contentAPreview: (p.messageA.content || "").slice(0, 80),
                                messageBId: p.messageB.id, contentBPreview: (p.messageB.content || "").slice(0, 80)
                            };
                            cur = cur.return;
                        }
                        return null;
                    };
                    const callSkipApi = async (chatId, messageAId, messageBId) => {
                        const url = `https://arena.ai/nextjs-api/stream/skip-direct-battle/${chatId}`;
                        const body = JSON.stringify({ messageAId, messageBId });
                        const res = await fetch(url, { method: "POST", headers: { accept: "*/*", "content-type": "text/plain;charset=UTF-8" }, body, mode: "cors", credentials: "include" });
                        return { ok: res.ok, status: res.status, statusText: res.statusText, body: (await res.text()).slice(0, 500), requestUrl: url, requestBody: body };
                    };
                    const createSkipHandler = btn => async () => {
                        const live = findSkipButton();
                        if (live) { live.click(); return; }
                        const chatId = getChatId();
                        if (!chatId) { alert("Arena Fixes: Could not extract chat ID. Choose Continue with A or B instead."); return; }
                        const ids = findMessageIds();
                        if (!ids) { alert("Arena Fixes: Could not find message IDs. Try reloading."); return; }
                        btn.disabled = true; btn.style.opacity = "0.5";
                        try {
                            const r = await callSkipApi(chatId, ids.messageAId, ids.messageBId);
                            btn.disabled = false; btn.style.opacity = "1";
                            if (r.ok) { window.location.reload(); return; }
                            const isSeq = /first response|sequence|only allowed/i.test(r.body);
                            alert(`Arena Fixes: Skip API failed (${r.status})\n\n${r.body}\n\n${isSeq ? "Skipping only allowed for first response. Choose Continue with A or B instead." : "Try Unstuck Chat or reload the page."}`);
                        } catch (e) { btn.disabled = false; btn.style.opacity = "1"; alert(`Arena Fixes: Skip failed.\n\n${e.message || e}`); }
                    };
                    const SKIP_CLASSES = "inline-flex items-center justify-center whitespace-nowrap transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 px-4 py-2 text-sm rounded-[4px] font-normal border-border-medium bg-surface-primary hover:bg-surface-secondary flex-1 gap-2 border";
                    const SKIP_INNER = "<span>Skip</span><svg width='18' height='18' viewBox='0 0 24 24' stroke-width='1.5' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M3 12L21 12M21 12L12.5 3.5M21 12L12.5 20.5' stroke='currentColor' stroke-linecap='round' stroke-linejoin='round'></path></svg>";
                    const existing = findSkipButton();
                    if (existing) {
                        existing.removeAttribute("disabled");
                        existing.classList.remove("pointer-events-none", "cursor-not-allowed", "opacity-50");
                        Object.assign(existing.style, { display: "inline-flex", visibility: "visible", opacity: "1", pointerEvents: "auto" });
                        unhideParents(existing);
                        existing.scrollIntoView({ behavior: "smooth", block: "center" });
                        alert("Arena Fixes: Skip button restored.");
                        return;
                    }
                    if (document.getElementById("arena-fixes-skip-button")) { alert("Arena Fixes: Skip button already present."); return; }
                    const chatId = getChatId();
                    const findDesktopToolbar = () => {
                        for (const outer of [...document.querySelectorAll("div.hidden")]) {
                            if (!outer.className.includes("md:absolute") || !outer.className.includes("md:flex")) continue;
                            const inner = outer.querySelector("div.flex");
                            if (!inner) continue;
                            const btns = [...inner.querySelectorAll("button")];
                            const a = btns.find(b => b.textContent.includes("Continue with A"));
                            const bb = btns.find(b => b.textContent.includes("Continue with B"));
                            if (a && bb) return { outer, inner, continueA: a, continueB: bb };
                        }
                        return null;
                    };
                    const hasAB = el => [...el.querySelectorAll("button")].some(b => b.textContent.includes("Continue with A") || b.textContent.includes("Continue with B"));
                    const findFallback = () =>
                        [...document.querySelectorAll("div.flex.w-full.flex-col.items-center")].find(hasAB)
                        || [...document.querySelectorAll("div.hidden")].find(el => el.className.includes("md:absolute") && el.className.includes("md:flex") && hasAB(el))
                        || (() => { const cards = [...document.querySelectorAll("[aria-roledescription='slide']")].sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top); let c = cards[0]; for (let i = 0; i < 15 && c; i++) { if (c.getAttribute("role") === "region") return c; c = c.parentElement; } return null; })()
                        || (() => { const btn = [...document.querySelectorAll("button")].find(b => b.textContent.includes("Continue with A") || b.textContent.includes("Continue with B")); return btn ? (btn.closest("div.flex") || btn.parentElement) : null; })();
                    const dt = findDesktopToolbar();
                    if (dt) {
                        const skipBtn = document.createElement("button");
                        skipBtn.id = "arena-fixes-skip-button"; skipBtn.className = SKIP_CLASSES; skipBtn.type = "button"; skipBtn.innerHTML = SKIP_INNER;
                        skipBtn.addEventListener("click", createSkipHandler(skipBtn));
                        dt.inner.insertBefore(skipBtn, dt.continueB);
                        unhideParents(dt.outer); dt.outer.scrollIntoView({ behavior: "smooth", block: "center" });
                        alert(chatId ? "Arena Fixes: Skip button restored." : "Arena Fixes: Skip button added.\n\nWarning: Could not extract chat ID. Skip may fail.");
                        return;
                    }
                    const target = findFallback();
                    if (!target) { alert("Arena Fixes: Could not find the battle area.\n\nMake sure a battle comparison is showing, or try Unstuck Chat first."); return; }
                    const wrapper = document.createElement("div");
                    wrapper.id = "arena-fixes-skip-toolbar"; wrapper.className = "flex w-full justify-center"; wrapper.style.marginTop = "8px";
                    wrapper.innerHTML = `<button class="${SKIP_CLASSES.replace("flex-1", "")} min-w-[110px] md:min-w-[140px]" type="button">${SKIP_INNER}</button>`;
                    const skipBtn = wrapper.querySelector("button"); skipBtn.id = "arena-fixes-skip-button";
                    skipBtn.addEventListener("click", createSkipHandler(skipBtn));
                    target.after ? target.after(wrapper) : target.parentNode.appendChild(wrapper);
                    unhideParents(wrapper); wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
                    alert(chatId ? "Arena Fixes: Skip button restored." : "Arena Fixes: Skip button added.\n\nWarning: Could not extract chat ID. Skip may fail.");
                }
            });
            UI.setStatus("Restore Skip finished.", "success");
        } catch (err) {
            UI.setStatus("Restore Skip failed.", "error");
            await ChromeAPI.showPageAlert(tab.id, `Arena Fixes: Restore Skip failed.\n\n${err.message || err}`);
        }
    },

    async runRemoveStuckOverlay(UI, App) {
        const tab = await ChromeAPI.getArenaTab(App);
        if (!tab) { UI.setStatus("Open arena.ai first.", "warning"); return; }
        UI.setStatus("Removing overlays…");
        try {
            const result = await ChromeAPI.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const PATTERNS = ["recaptcha", "hcaptcha", "g-recaptcha", "h-captcha", "captcha", "turnstile", "cf-turnstile", "cf-challenge", "challenge-form", "challenge-container"];
                    const removed = new Set();
                    const markIfCaptcha = el => { const str = ((el.src || "") + (el.id || "") + (el.className || "")).toLowerCase(); if (PATTERNS.some(p => str.includes(p))) removed.add(el); };
                    document.querySelectorAll("iframe").forEach(markIfCaptcha);
                    document.querySelectorAll("div").forEach(div => { const str = (div.id + div.className).toLowerCase(); if (!PATTERNS.some(p => str.includes(p))) return; const pos = window.getComputedStyle(div).position; if (pos === "fixed" || pos === "absolute") removed.add(div); });
                    for (const el of document.querySelectorAll("body *")) {
                        const cs = window.getComputedStyle(el); const z = parseInt(cs.zIndex, 10); const rc = el.getBoundingClientRect();
                        const isFixed = cs.position === "fixed" || cs.position === "absolute";
                        const coversVP = rc.width >= innerWidth * .9 && rc.height >= innerHeight * .9 && rc.top <= 5 && rc.left <= 5;
                        const highZ = !isNaN(z) && z >= 999999; const absurdZ = !isNaN(z) && z >= 2000000000;
                        if ((isFixed && coversVP && highZ && cs.pointerEvents !== "none") || (isFixed && absurdZ)) removed.add(el);
                    }
                    removed.forEach(el => { try { el.remove(); } catch { } });
                    ["documentElement", "body"].forEach(k => { document[k].style.overflow = document[k].style.pointerEvents = document[k].style.userSelect = "auto"; });
                    return { removedCount: removed.size };
                }
            });
            const count = result?.removedCount ?? 0;
            await ChromeAPI.showPageAlert(tab.id, count === 0
                ? "Arena Fixes: No stuck overlays found.\n\nIf still blocked, try Unstuck Chat or reload."
                : `Arena Fixes: Removed ${count} blocking element(s).\n\nIf not fully fixed, try Unstuck Chat or reload.`);
            UI.setStatus("Overlay cleanup done.", "success");
        } catch (err) {
            UI.setStatus("Remove Overlay failed.", "error");
            await ChromeAPI.showPageAlert(tab.id, `Arena Fixes: Remove Overlay failed.\n\n${err.message || err}`);
        }
    },

    async runFixCaptcha(UI, App) {
        const tab = await ChromeAPI.getArenaTab(App);
        if (!tab) { UI.setStatus("Open arena.ai first.", "warning"); return; }
        const browser = this.detectBrowser();
        const companionRunning = await Companion.isRunning();
        const PATTERNS = ["recaptcha", "hcaptcha", "g-recaptcha", "h-captcha", "captcha", "turnstile", "cf-turnstile", "cf-challenge", "challenge-form"];
        const scheme = browser === "Brave" ? "brave" : "chrome";
        const manualSteps = [`1. Click the lock icon → "Site settings".`, `2. Click "Delete data" for arena.ai.`, `3. Or go to: ${scheme}://settings/content/all?searchSubpage=arena.ai`, `4. Close ALL ${browser} windows, then reopen arena.ai.`, `5. Run network commands from the Advanced tab.`].join("\n");
        try {
            UI.setStatus("Step 1: Removing captcha elements…");
            await ChromeAPI.executeScript({
                target: { tabId: tab.id },
                func: (patterns) => {
                    document.querySelectorAll("iframe").forEach(el => { if (patterns.some(p => (el.src + el.id + el.className).toLowerCase().includes(p))) el.remove(); });
                    document.querySelectorAll("div").forEach(el => { if (!patterns.some(p => (el.id + el.className).toLowerCase().includes(p))) return; const pos = window.getComputedStyle(el).position; if (pos === "fixed" || pos === "absolute") el.remove(); });
                    for (const el of document.querySelectorAll("body *")) { const cs = window.getComputedStyle(el); const z = parseInt(cs.zIndex, 10); if (!isNaN(z) && z >= 2000000000 && (cs.position === "fixed" || cs.position === "absolute")) try { el.remove(); } catch { } }
                },
                args: [PATTERNS]
            });
            await App.wait(400);
            UI.setStatus("Step 2: Clearing arena.ai data…");
            const nukeResult = await ChromeAPI.sendToRuntime({ type: "NUKE_ARENA_FULL", tabId: tab.id });
            const cookiesRemoved = nukeResult?.cookieApi?.removed || 0;
            UI.setStatus(`Removed ${cookiesRemoved} cookie(s). Reloading…`);
            await ChromeAPI.reloadTab(tab.id);
            UI.setStatus("Waiting for page to load…");
            await ChromeAPI.waitForTabReady(tab.id, 15000);
            await App.wait(1500);

            UI.setStatus("Checking for login button…");
            let loginVisible = false;
            for (let i = 0; i < 10; i++) {
                loginVisible = await ChromeAPI.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        const all = [...document.querySelectorAll('button, a')];
                        return all.some(el => el.textContent.trim() === 'Login');
                    }
                });
                if (loginVisible) break;
                await App.wait(800);
            }

            if (loginVisible) {
                if (companionRunning) { UI.setStatus("Running network reset…"); await Companion.runNetwork(); }
                const ct = await ChromeAPI.getActiveTab();
                if (ct?.id) await ChromeAPI.showPageAlert(ct.id, `Arena Fixes: Fix Captcha — Success! Login button detected.\n\nBrowser: ${browser}\nCookies removed: ${cookiesRemoved}\n\n${companionRunning ? "Network reset running in companion app.\nLog in again to continue." : `Log in again to continue.\n\nIf captcha persists:\n${manualSteps}`}`);
                UI.setStatus("Fix Captcha succeeded.", "success");
                return;
            }

            let check = await ChromeAPI.sendToRuntime({ type: "CHECK_ARENA_COOKIES" });
            let remaining = check?.remaining || [];
            if (remaining.length) {
                UI.setStatus("Stubborn cookies found. Second pass…");
                await ChromeAPI.sendToRuntime({ type: "NUKE_ARENA_FULL", tabId: tab.id });
                await ChromeAPI.reloadTab(tab.id);
                UI.setStatus("Waiting for page to load…");
                await ChromeAPI.waitForTabReady(tab.id, 15000);
                await App.wait(1500);
                check = await ChromeAPI.sendToRuntime({ type: "CHECK_ARENA_COOKIES" });
                remaining = check?.remaining || [];
            }
            if (remaining.length) {
                const list = remaining.map(c => `${c.name} [${c.domain}${c.path}]`).join("\n");
                if (companionRunning) await Companion.showManualSteps(list, browser);
                else { const ct = await ChromeAPI.getActiveTab(); if (ct?.id) await ChromeAPI.showPageAlert(ct.id, `Arena Fixes: Stubborn cookies remain (${remaining.length}).\n\nBrowser: ${browser}\n\n${list}\n\nManual steps:\n${manualSteps}`); }
                UI.setStatus(`Fix Captcha: ${remaining.length} stubborn cookie(s) remain.`, "warning");
                return;
            }
            if (companionRunning) { UI.setStatus("Running network reset…"); await Companion.runNetwork(); }
            const ct = await ChromeAPI.getActiveTab();
            if (ct?.id) await ChromeAPI.showPageAlert(ct.id, `Arena Fixes: Fix Captcha — Done, but login button not detected — may need another reload.\n\nBrowser: ${browser}\nCookies removed: ${cookiesRemoved}\n\n${companionRunning ? "Network reset running in companion app.\nLog in again if needed." : `Log in again if needed.\n\nIf captcha persists:\n${manualSteps}`}`);
            UI.setStatus("Fix Captcha done, check page.", "warning");
        } catch (err) {
            UI.setStatus("Fix Captcha failed.", "error");
            if (companionRunning) await Companion.showManualSteps(`Extension error: ${err.message || err}`, browser);
            const ct = await ChromeAPI.getActiveTab();
            if (ct?.id) await ChromeAPI.showPageAlert(ct.id, `Arena Fixes: Fix Captcha failed.\n\nBrowser: ${browser}\nError: ${err.message || err}\n\nManual steps:\n${manualSteps}`);
        }
    }
}