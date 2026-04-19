const ChromeAPI = {
    async getActiveTab() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab;
    },
    async sendMessageToTab(tabId, message) {
        try { return await chrome.tabs.sendMessage(tabId, message); }
        catch (e) { console.error("sendMessageToTab:", e); return null; }
    },
    async executeScript(options) {
        try {
            const results = await chrome.scripting.executeScript(options);
            return results?.[0]?.result ?? null;
        } catch (e) { console.error("executeScript:", e); return null; }
    },
    async showPageAlert(tabId, message) {
        await this.executeScript({ target: { tabId }, world: "MAIN", func: m => alert(m), args: [message] });
    },
    async reloadTab(tabId) { await chrome.tabs.reload(tabId); },
    async waitForTabReady(tabId, timeoutMs = 15000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try {
                const tab = await chrome.tabs.get(tabId);
                if (tab.status === "complete") return true;
            } catch { return false; }
            await new Promise(r => setTimeout(r, 400));
        }
        return false;
    },
    async storageGet(keys) { return await chrome.storage.local.get(keys); },
    async storageSet(data) { await chrome.storage.local.set(data); },
    async sendToRuntime(msg) { return await chrome.runtime.sendMessage(msg); },
    async getArenaTab(App) {
        const tab = await this.getActiveTab();
        if (tab?.id && tab.url && App.isArenaUrl(tab.url)) return tab;
        return null;
    },
    detectBrowser() {
        const ua = navigator.userAgent || "";
        if (navigator.brave || ua.includes("Brave")) return "Brave";
        if (ua.includes("Edg/")) return "Edge";
        if (ua.includes("Chrome")) return "Chrome";
        return "Unknown";
    },
};