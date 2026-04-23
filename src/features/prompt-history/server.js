const PROMPT_HISTORY_ACTIONS = {
    async loadPromptHistorySetting(UI) {
        const { promptHistoryEnabled } = await ChromeAPI.storageGet(['promptHistoryEnabled']);
        UI.setPromptHistoryToggle(!!promptHistoryEnabled);
    },
    async updatePromptHistorySetting(UI, App) {
        const enabled = UI.el.promptHistoryToggle.checked;
        await ChromeAPI.storageSet({ promptHistoryEnabled: enabled });
        const tab = await ChromeAPI.getArenaTab(App);
        if (tab) await ChromeAPI.sendMessageToTab(tab.id, { type: MSG.REFRESH_PROMPT_HISTORY }).catch(() => {});
        UI.setStatus(
            enabled ? 'Prompt history & autosave enabled.' : 'Prompt history disabled.',
            'success'
        );
    },
};