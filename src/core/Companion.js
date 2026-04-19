const Companion = {
    PORT: 48372,
    async request(action) {
        try {
            const res = await fetch(`http://127.0.0.1:${this.PORT}/${action}`, {
                method: "GET", signal: AbortSignal.timeout(5000)
            });
            return await res.json();
        } catch { return null; }
    },
    async isRunning() { const r = await this.request("ping"); return r?.status === "ok"; },
    async runNetwork() { return this.request("network"); },
    async showManualSteps(info, browser) {
        return this.request(`manual_cookies?browser=${encodeURIComponent(browser)}&info=${encodeURIComponent(info)}`);
    }
};