document.addEventListener("DOMContentLoaded", () => {
    (function renderAbout() {
        const container = document.getElementById("aboutCredits");
        PEOPLE.forEach(p => {
            const el = p.url ? document.createElement("a") : document.createElement("div");
            el.className = "credit-item";
            if (p.url) { el.href = p.url; el.target = "_blank"; el.rel = "noopener noreferrer"; }
            el.innerHTML = `
                <img src="${p.avatar}" alt="${p.name}" class="credit-logo">
                <div class="credit-info">
                    <div class="credit-name">${p.name}</div>
                    <div class="credit-description">${p.aboutDesc}</div>
                </div>`;
            container.appendChild(el);
        });
    })();

    (function renderDonate() {
        const container = document.getElementById("donateCards");
        PEOPLE.filter(p => p.coins).forEach(p => {
            const card = document.createElement("div");
            card.className = "card";
            const header = `
                <div class="card-label">${p.name}</div>
                <div class="donate-person-row">
                    <img src="${p.avatar}" alt="${p.name}" class="donate-avatar">
                    <div>
                        <div class="donate-name">${p.name}</div>
                        <div class="donate-role">${p.role}</div>
                    </div>
                </div>`;
            const tabNav = `<div class="crypto-tab-nav" data-person="${p.key}">
                ${p.coins.map((c, i) => `
                    <button class="crypto-tab-btn${i === 0 ? " active" : ""}" data-person="${p.key}" data-coin="${c.coin}">
                        <span class="coin-badge ${c.badgeClass}" style="width:12px;height:12px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;flex-shrink:0;">${c.badgeSvg}</span>
                        ${c.label}
                    </button>`).join("")}
            </div>`;
            const panels = p.coins.map((c, i) => `
                <div class="crypto-panel${i === 0 ? " active" : ""}" id="panel-${p.key}-${c.coin}">
                    <div class="coin-badge-row">
                        <div class="coin-badge ${c.badgeClass}">${c.badgeSvg}</div>
                        <span class="coin-label">${c.displayLabel}</span>
                    </div>
                    <div class="addr-box" id="addr-${p.key}-${c.coin}">${c.addr}</div>
                    <button class="donate-copy-btn" id="btn-${p.key}-${c.coin}">
                        ${ICONS.COPY_ICON} Copy address
                    </button>
                    <button class="qr-btn" data-person="${p.key}" data-coin="${c.coin}">
                        ${ICONS.QR_ICON} Show QR code
                    </button>
                </div>`).join("");
            card.innerHTML = header + tabNav + panels;
            container.appendChild(card);
        });
    })();

    const $ = id => document.getElementById(id);
    const $$ = sel => document.querySelectorAll(sel);

    const App = {
        init() {
            UI.bindEvents();
            this.initialLoad();
        },
        async initialLoad() {
            await Promise.all([
                Actions.loadBottomCopySetting(UI),
                Actions.loadOldThemeSetting(UI),
                Actions.loadAutoScrollSetting(UI),
                Actions.loadProfilePicSetting(UI),
                Actions.loadEnhancePromptSetting(UI),
                Actions.loadRawMarkdownSetting(UI),
                Actions.refreshLatestUserMessagePreview(UI, App),
                Actions.loadStarringSetting(UI)
            ]);
            UI.setStatus("Ready.");
        },
        isArenaUrl(url) {
            if (!url) return false;
            try {
                const { hostname } = new URL(url);
                return hostname === "arena.ai" || hostname.endsWith(".arena.ai");
            } catch { return false; }
        },
        wait: ms => new Promise(r => setTimeout(r, ms))
    };

    const UI = {
        el: {
            status: $("status"),
            tabButtons: $$(".tab-btn"),
            tabContents: $$(".tab-content"),
            latestPreview: $("latestPreview"),
            bottomCopyToggle: $("bottomCopyToggle"),
            oldThemeToggle: $("oldThemeToggle"),
            autoScrollToggle: $("autoScrollToggle"),
            profilePicToggle: $("profilePicToggle"),
            profilePicUrl: $("profilePicUrl"),
            enhancePromptToggle: $("enhancePromptToggle"),
            rawMarkdownToggle: $("rawMarkdownToggle"),
            enableStarringToggle: $('enableStarringToggle')
        },
        bindEvents() {
            this.el.tabButtons.forEach(btn =>
                btn.addEventListener("click", () => this.switchTab(btn.dataset.tab))
            );
            $("unstuckBtn").addEventListener("click", () => Actions.runUnstuckChat(UI, App));
            $("restoreSkipBtn").addEventListener("click", () => Actions.runRestoreSkipButton(UI, App));
            $("removeOverlayBtn").addEventListener("click", () => Actions.runRemoveStuckOverlay(UI, App));
            $("captchaBtn").addEventListener("click", () => Actions.runFixCaptcha(UI, App));
            $("copyCmdsBtn").addEventListener("click", () => Actions.copyCommands(UI, App));
            $("copyLatestBtn").addEventListener("click", () => Actions.copyLatestUserMessage(UI, App));
            this.el.bottomCopyToggle.addEventListener("change", () => Actions.updateBottomCopySetting(UI));
            this.el.oldThemeToggle.addEventListener("change", () => Actions.updateOldThemeSetting(UI));
            this.el.autoScrollToggle.addEventListener("change", () => Actions.updateAutoScrollSetting(UI, App));
            this.el.profilePicToggle.addEventListener("change", () => Actions.updateProfilePicSetting(UI, App));
            this.el.profilePicUrl.addEventListener("change", () => Actions.updateProfilePicUrl(UI, App));
            this.el.profilePicUrl.addEventListener("blur", () => Actions.updateProfilePicUrl(UI, App));
            this.el.enhancePromptToggle.addEventListener("change", () => Actions.updateEnhancePromptSetting(UI));
            this.el.rawMarkdownToggle.addEventListener("change", () => Actions.updateRawMarkdownSetting(UI, App));
            this.el.enableStarringToggle.addEventListener('change', () =>
                Actions.updateStarringSetting(UI, App)
            );
        },
        switchTab(tabId) {
            this.el.tabContents.forEach(c => c.classList.remove("active"));
            this.el.tabButtons.forEach(b => b.classList.remove("active"));
            $(`tab-${tabId}`).classList.add("active");
            document.querySelector(`[data-tab='${tabId}']`).classList.add("active");
        },
        setStatus(message, type = "default") {
            this.el.status.textContent = message;
            this.el.status.className = type;
        },
        setLatestPreview: text => { UI.el.latestPreview.textContent = text; },
        setBottomCopyToggle: checked => { UI.el.bottomCopyToggle.checked = checked; },
        setOldThemeToggle: checked => { UI.el.oldThemeToggle.checked = checked; },
        setAutoScrollToggle: checked => { UI.el.autoScrollToggle.checked = checked; },
        setProfilePicToggle: checked => { UI.el.profilePicToggle.checked = checked; },
        setProfilePicUrl: url => { UI.el.profilePicUrl.value = url || ""; },
        setEnhancePromptToggle: checked => { UI.el.enhancePromptToggle.checked = checked; },
        setRawMarkdownToggle: checked => { UI.el.rawMarkdownToggle.checked = checked; },
        setStarringToggle: checked => { UI.el.enableStarringToggle.checked = checked; }
    };

    const Actions = {
        ...CHAT_FIXES_ACTIONS,

        ...ENHANCE_PROMPT_ACTIONS,
        ...BOTTOM_COPY_ACTIONS,
        ...LMARENA_THEME_ACTIONS,
        ...AUTO_SCROLL_ACTIONS,
        ...PROFILE_PIC_ACTIONS,
        ...RAW_MARKDOWN_ACTIONS,
        ...MODEL_STARRING_ACTIONS
    };

    App.init();

    document.querySelectorAll(".crypto-tab-nav").forEach(nav => {
        nav.querySelectorAll(".crypto-tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const { person, coin } = btn.dataset;
                nav.querySelectorAll(".crypto-tab-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                nav.closest(".card").querySelectorAll(".crypto-panel").forEach(p => p.classList.remove("active"));
                $(`panel-${person}-${coin}`).classList.add("active");
            });
        });
    });

    PEOPLE.filter(p => p.coins).forEach(p => {
        p.coins.forEach(c => {
            const btn = $(`btn-${p.key}-${c.coin}`);
            if (!btn) return;
            btn.addEventListener("click", () => {
                if (!c.addr) { btn.innerHTML = `${ICONS.COPY_ICON} No address set`; setTimeout(() => { btn.innerHTML = `${ICONS.COPY_ICON} Copy address`; }, 1500); return; }
                navigator.clipboard.writeText(c.addr).then(() => {
                    btn.classList.add("copied");
                    btn.innerHTML = `${ICONS.CHECK_ICON} Copied!`;
                    setTimeout(() => { btn.classList.remove("copied"); btn.innerHTML = `${ICONS.COPY_ICON} Copy address`; }, 2000);
                });
            });
        });
    });

    const backdrop = $("qrBackdrop");
    const modalImg = $("qrModalImg");
    const modalPh = $("qrModalPlaceholder");
    const modalName = $("qrModalName");
    const modalCoin = $("qrModalCoin");
    const modalAddr = $("qrModalAddr");

    const openQR = (personKey, coinKey) => {
        const person = PEOPLE.find(p => p.key === personKey);
        const coin = person?.coins?.find(c => c.coin === coinKey);
        if (!person || !coin) return;
        modalName.textContent = person.name;
        modalCoin.textContent = coin.coin.toUpperCase();
        modalCoin.className = `qr-modal-coin ${coinKey}`;
        modalAddr.textContent = coin.addr || "";
        if (coin.qr) { modalImg.src = coin.qr; modalImg.style.display = "block"; modalPh.style.display = "none"; }
        else { modalImg.style.display = "none"; modalPh.style.display = "flex"; }
        backdrop.classList.add("open");
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    };

    const closeQR = () => backdrop.classList.remove("open");
    document.querySelectorAll(".qr-btn").forEach(btn => btn.addEventListener("click", () => openQR(btn.dataset.person, btn.dataset.coin)));
    $("qrClose").addEventListener("click", closeQR);
    backdrop.addEventListener("click", e => { if (e.target === backdrop) closeQR(); });
});