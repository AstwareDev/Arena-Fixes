const MODEL_STARRING_ACTIONS = {
    async loadStarringSetting(UI) {
        const { enableStarringEnabled } = await ChromeAPI.storageGet(['enableStarringEnabled']);
        UI.setStarringToggle(!!enableStarringEnabled);
    },

    async updateStarringSetting(UI, App) {
        const enabled = UI.el.enableStarringToggle.checked;
        await ChromeAPI.storageSet({ enableStarringEnabled: enabled });
        const tab = await this.getArenaTab?.();
        if (tab) {
            await ChromeAPI.sendMessageToTab(tab.id, { type: 'REFRESH_MODEL_STARRING' }).catch(() => {});
        }
        UI.setStatus(
            enabled ? 'Model starring enabled.' : 'Model starring disabled.',
            'success'
        );
    },
};