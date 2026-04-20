const PROFILE_PIC_ACTIONS = {
    async loadProfilePicSetting(UI) {
        const { profilePicEnabled, profilePicUrl, capturedGooglePic } = await ChromeAPI.storageGet(["profilePicEnabled", "profilePicUrl", "capturedGooglePic"]);
        UI.setProfilePicToggle(!!profilePicEnabled);
        UI.setProfilePicUrl(profilePicUrl || capturedGooglePic || "");
    },
    async updateProfilePicSetting(UI, App) {
        const enabled = UI.el.profilePicToggle.checked;
        const url = UI.el.profilePicUrl.value.trim();
        await ChromeAPI.storageSet({ profilePicEnabled: enabled, profilePicUrl: url });
        const tab = await ChromeAPI.getArenaTab(App);
        if (tab) await ChromeAPI.sendMessageToTab(tab.id, { type: MSG.REFRESH_PROFILE_PIC }).catch(() => { });
        if (enabled && !url) { UI.setStatus("Profile pic enabled. Paste your image URL!", "warning"); return; }
        UI.setStatus(enabled ? "Profile picture fix enabled." : "Profile picture fix disabled.", "success");
    },
    async updateProfilePicUrl(UI, App) {
        const url = UI.el.profilePicUrl.value.trim();
        const enabled = UI.el.profilePicToggle.checked;
        await ChromeAPI.storageSet({ profilePicUrl: url });
        if (!enabled || !url) return;
        const tab = await ChromeAPI.getArenaTab(App);
        if (tab) await ChromeAPI.sendMessageToTab(tab.id, { type: MSG.REFRESH_PROFILE_PIC }).catch(() => { });
        UI.setStatus("Profile picture URL saved.", "success");
    },
}