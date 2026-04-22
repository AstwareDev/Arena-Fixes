const RENAME_CONV_ACTIONS = {
    async loadRenameConvSetting(UI) {
        const data = await ChromeAPI.storageGet([STORAGE_KEYS.RENAME_CONV_ENABLED]);
        UI.setRenameConvToggle(!!data[STORAGE_KEYS.RENAME_CONV_ENABLED]);
    },

    async updateRenameConvSetting(UI, App) {
        const enabled = UI.el.renameConversationsToggle.checked;
        await ChromeAPI.storageSet({ [STORAGE_KEYS.RENAME_CONV_ENABLED]: enabled });
        const tab = await ChromeAPI.getArenaTab(App);
        if (tab) {
            await ChromeAPI.sendMessageToTab(tab.id, { type: MSG.REFRESH_RENAME_CONV }).catch(() => {});
        }
        UI.setStatus(
            enabled ? 'Conversation renaming enabled.' : 'Conversation renaming disabled.',
            'success'
        );
    },
};