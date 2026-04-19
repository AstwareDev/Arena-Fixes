const BOTTOM_COPY_ACTIONS = {
    async loadBottomCopySetting(UI) {
        const { bottomCopyEnabled } = await ChromeAPI.storageGet(["bottomCopyEnabled"]);
        UI.setBottomCopyToggle(!!bottomCopyEnabled);
    },
    async updateBottomCopySetting(UI) {
        const enabled = UI.el.bottomCopyToggle.checked;
        await ChromeAPI.storageSet({ bottomCopyEnabled: enabled });
        const tab = await this.getArenaTab();
        if (tab) await ChromeAPI.sendMessageToTab(tab.id, { type: MSG.REFRESH_COPY_BUTTONS }).catch(() => { });
        UI.setStatus(enabled ? "Bottom copy buttons enabled." : "Bottom copy buttons disabled.", "success");
    },
}