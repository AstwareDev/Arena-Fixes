const AUTO_SCROLL_ACTIONS = {
    async loadAutoScrollSetting(UI) {
        const { autoScrollDisabled } = await ChromeAPI.storageGet(["autoScrollDisabled"]);
        UI.setAutoScrollToggle(!!autoScrollDisabled);
    },
    async updateAutoScrollSetting(UI, App) {
        const enabled = UI.el.autoScrollToggle.checked;
        await ChromeAPI.storageSet({ autoScrollDisabled: enabled });
        const tab = await ChromeAPI.getArenaTab(App);
        if (tab) await ChromeAPI.sendMessageToTab(tab.id, { type: MSG.REFRESH_AUTO_SCROLL }).catch(() => { });
        UI.setStatus(enabled ? "Auto scroll disabled." : "Auto scroll enabled.", "success");
    },
}