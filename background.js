import { STORAGE_KEYS, ARENA_DOMAINS, ORIGIN_WHITELIST } from "./constants.js";

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(Object.values(STORAGE_KEYS), data => {
        const defaults = {};
        for (const key of Object.values(STORAGE_KEYS)) {
            if (typeof data[key] === "undefined") {
                if (key.includes("ENABLED")) defaults[key] = false;
                else if (key.includes("URL")) defaults[key] = "";
            }
        }
        if (Object.keys(defaults).length > 0) chrome.storage.local.set(defaults);
    });
});

async function nukeArenaCookiesViaApi() {
  const results = { removed: 0, failed: 0, details: [] };
  const domains = ARENA_DOMAINS;

  for (const domain of domains) {
    try {
      const cookies = await chrome.cookies.getAll({ domain: domain });
      for (const cookie of cookies) {
        const cleanDomain = cookie.domain.startsWith(".") ? cookie.domain.substring(1) : cookie.domain;
        const urls = [
          `https://${cleanDomain}${cookie.path}`,
          `http://${cleanDomain}${cookie.path}`,
          `https://${cleanDomain}/`,
          `https://arena.ai/`
        ];
        let removed = false;
        for (const url of urls) {
          try {
            await chrome.cookies.remove({ url, name: cookie.name, storeId: cookie.storeId });
            removed = true;
            break;
          } catch {}
        }
        if (removed) {
          results.removed++;
          results.details.push(`Removed: ${cookie.name} [${cookie.domain}${cookie.path}]`);
        } else {
          results.failed++;
          results.details.push(`Failed: ${cookie.name} [${cookie.domain}${cookie.path}]`);
        }
      }
    } catch {}
  }

  try {
    const allCookies = await chrome.cookies.getAll({});
    for (const cookie of allCookies) {
      if (cookie.domain.includes("arena.ai")) {
        const cleanDomain = cookie.domain.startsWith(".") ? cookie.domain.substring(1) : cookie.domain;
        const urls = [
          `https://${cleanDomain}${cookie.path}`,
          `http://${cleanDomain}${cookie.path}`,
          `https://${cleanDomain}/`,
          `https://arena.ai/`
        ];
        for (const url of urls) {
          try {
            await chrome.cookies.remove({ url, name: cookie.name, storeId: cookie.storeId });
            results.removed++;
            results.details.push(`Removed (sweep): ${cookie.name} [${cookie.domain}]`);
            break;
          } catch {}
        }
      }
    }
  } catch {}

  return results;
}

async function nukeBrowsingData() {
  const origins = ORIGIN_WHITELIST;
  const steps = [];

  const operations = [
    ["removeCookies", "Cookies"],
    ["removeLocalStorage", "LocalStorage"],
    ["removeCache", "Cache"],
    ["removeIndexedDB", "IndexedDB"],
    ["removeServiceWorkers", "ServiceWorkers"],
    ["removeCacheStorage", "CacheStorage"]
  ];

  for (const [method, label] of operations) {
    try {
      await chrome.browsingData[method]({ origins });
      steps.push(`${label}: cleared`);
    } catch (e) {
      try {
        await chrome.browsingData[method]({});
        steps.push(`${label}: cleared (global)`);
      } catch (e2) {
        steps.push(`${label}: failed - ${e2.message || e2}`);
      }
    }
  }

  return steps;
}

async function clearPageStorage(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try { localStorage.clear(); } catch {}
        try { sessionStorage.clear(); } catch {}
        try {
          if ("indexedDB" in window && indexedDB.databases) {
            indexedDB.databases().then(dbs => {
              for (const db of dbs) {
                if (db.name) indexedDB.deleteDatabase(db.name);
              }
            });
          }
        } catch {}
        try {
          if ("caches" in window) {
            caches.keys().then(names => {
              for (const name of names) caches.delete(name);
            });
          }
        } catch {}
        try {
          navigator.serviceWorker.getRegistrations().then(regs => {
            for (const reg of regs) reg.unregister();
          });
        } catch {}
      }
    });
    return true;
  } catch {
    return false;
  }
}

async function verifyArenaCookiesGone() {
  const remaining = [];
  try {
    const allCookies = await chrome.cookies.getAll({});
    for (const cookie of allCookies) {
      if (cookie.domain.includes("arena.ai")) {
        remaining.push({
          name: cookie.name,
          domain: cookie.domain,
          path: cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          storeId: cookie.storeId
        });
      }
    }
  } catch {}
  return remaining;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "NUKE_ARENA_FULL") {
    (async () => {
      const tabId = message.tabId || null;
      const results = {
        cookieApi: null,
        browsingData: null,
        pageStorage: false,
        remaining: [],
        attempts: 0
      };

      for (let attempt = 1; attempt <= 3; attempt++) {
        results.attempts = attempt;
        results.cookieApi = await nukeArenaCookiesViaApi();
        results.browsingData = await nukeBrowsingData();
        if (tabId) {
          results.pageStorage = await clearPageStorage(tabId);
        }
        results.remaining = await verifyArenaCookiesGone();
        if (results.remaining.length === 0) break;
        await new Promise(r => setTimeout(r, 500));
      }

      if (results.remaining.length > 0) {
        for (const cookie of [...results.remaining]) {
          const cleanDomain = cookie.domain.startsWith(".") ? cookie.domain.substring(1) : cookie.domain;
          for (const proto of ["https://", "http://"]) {
            for (const path of [cookie.path, "/"]) {
              try {
                await chrome.cookies.remove({
                  url: `${proto}${cleanDomain}${path}`,
                  name: cookie.name,
                  storeId: cookie.storeId
                });
              } catch {}
            }
          }
        }
        results.remaining = await verifyArenaCookiesGone();
      }

      sendResponse(results);
    })();
    return true;
  }

  if (message?.type === "CHECK_ARENA_COOKIES") {
    (async () => {
      const remaining = await verifyArenaCookiesGone();
      sendResponse({ remaining });
    })();
    return true;
  }
});