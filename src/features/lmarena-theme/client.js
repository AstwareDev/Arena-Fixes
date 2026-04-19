const LMARENA_THEME_ACTIONS = {
    async loadOldThemeSetting(UI) {
        const { oldThemeEnabled } = await ChromeAPI.storageGet(["oldThemeEnabled"]);
        UI.setOldThemeToggle(!!oldThemeEnabled);
    },
    async updateOldThemeSetting(UI) {
        const enabled = UI.el.oldThemeToggle.checked;
        await ChromeAPI.storageSet({ oldThemeEnabled: enabled });
        const tab = await this.getArenaTab();
        if (tab) await ChromeAPI.sendMessageToTab(tab.id, { type: MSG.REFRESH_OLD_THEME }).catch(() => { });
        UI.setStatus(enabled ? "LMArena theme enabled." : "LMArena theme disabled.", "success");
    },
}