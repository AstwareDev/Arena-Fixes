const RAW_MARKDOWN_ACTIONS = {
    async loadRawMarkdownSetting(UI) {
        const { rawMarkdownEnabled } = await ChromeAPI.storageGet(["rawMarkdownEnabled"]);
        UI.setRawMarkdownToggle(!!rawMarkdownEnabled);
    },
    async updateRawMarkdownSetting(UI, App) {
        const enabled = UI.el.rawMarkdownToggle.checked;
        await ChromeAPI.storageSet({ rawMarkdownEnabled: enabled });
        const tab = await ChromeAPI.getArenaTab(App);
        if (tab) await ChromeAPI.sendMessageToTab(tab.id, { type: MSG.REFRESH_RAW_MARKDOWN }).catch(() => { });
        UI.setStatus(enabled ? "Raw markdown enabled." : "Raw markdown disabled.", "success");
    },
}