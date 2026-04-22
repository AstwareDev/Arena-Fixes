const MODEL_STARRING_ACTIONS = {
    async loadStarringSetting(UI) {
        const { enableStarringEnabled } = await ChromeAPI.storageGet(['enableStarringEnabled']);
        UI.setStarringToggle(!!enableStarringEnabled);
    },

    async updateStarringSetting(UI, App) {
        const enabled = UI.el.enableStarringToggle.checked;
        await ChromeAPI.storageSet({ enableStarringEnabled: enabled });
        const tab = await ChromeAPI.getArenaTab(App);
        if (tab) {
            // FIX: was 'REFRESH_MODEL_STARRING' string literal — now uses MSG constant
            await ChromeAPI.sendMessageToTab(tab.id, { type: MSG.REFRESH_MODEL_STARRING }).catch(() => {});
        }
        UI.setStatus(
            enabled ? 'Model starring enabled.' : 'Model starring disabled.',
            'success'
        );
    },
};