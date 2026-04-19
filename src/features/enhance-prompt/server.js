const ENHANCE_PROMPT_ACTIONS = {
    async loadEnhancePromptSetting(UI) {
        const { enhancePromptEnabled } = await ChromeAPI.storageGet(["enhancePromptEnabled"]);
        UI.setEnhancePromptToggle(!!enhancePromptEnabled);
    },
    async updateEnhancePromptSetting(UI) {
        const enabled = UI.el.enhancePromptToggle.checked;
        await ChromeAPI.storageSet({ enhancePromptEnabled: enabled });
        const tab = await this.getArenaTab();
        if (tab) await ChromeAPI.sendMessageToTab(tab.id, { type: MSG.REFRESH_ENHANCE_PROMPT }).catch(() => { });
        UI.setStatus(enabled ? "Enhance Prompt button enabled." : "Enhance Prompt button disabled.", "success");
    },
}