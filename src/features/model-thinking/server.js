const MODEL_THINKING_ACTIONS = {
    async loadModelThinkingSetting(UI) {
        const { modelThinkingEnabled } = await ChromeAPI.storageGet(['modelThinkingEnabled']);
        UI.setModelThinkingToggle(!!modelThinkingEnabled);
    },
    async updateModelThinkingSetting(UI, App) {
        const enabled = UI.el.modelThinkingToggle.checked;
        await ChromeAPI.storageSet({ modelThinkingEnabled: enabled });
        const tab = await ChromeAPI.getArenaTab(App);
        if (tab) await ChromeAPI.sendMessageToTab(tab.id, { type: MSG.REFRESH_MODEL_THINKING }).catch(() => {});
        UI.setStatus(
            enabled ? 'Model thinking blocks enabled.' : 'Model thinking blocks disabled.',
            'success'
        );
    },
};