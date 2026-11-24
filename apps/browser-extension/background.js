const DEFAULT_API_BASE_URL = "https://focusgate-blue.vercel.app";
const DEFAULT_SUPABASE_URL = "https://dyfdeceiszmxozdqugon.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_TPpxronGIazapp2ylFORIw_ejce1q9C";
const SYNC_ALARM_NAME = "focusgate-policy-sync";

function extractHost(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function matchesDomain(host, pattern) {
  if (!host || !pattern) return false;
  const normalized = String(pattern).trim().toLowerCase().replace(/^www\./, "");
  if (!normalized) return false;
  return host === normalized || host.endsWith(`.${normalized}`);
}

function shouldBlockUrl(rawUrl, policy, apiBaseUrl) {
  if (!policy || !policy.lockActive) {
    return { blocked: false };
  }

  const host = extractHost(rawUrl);
  if (!host) {
    return { blocked: false };
  }

  const apiHost = extractHost(apiBaseUrl || DEFAULT_API_BASE_URL);
  if (apiHost && matchesDomain(host, apiHost)) {
    return { blocked: false };
  }
  if (host === "localhost" || host === "127.0.0.1") {
    return { blocked: false };
  }

  if (policy.whitelistFocusMode) {
    const allowedDomains = Array.isArray(policy.allowedDomains) ? policy.allowedDomains : [];
    const allowed = allowedDomains.some((domain) => matchesDomain(host, domain));
    return allowed ? { blocked: false } : { blocked: true, host, reason: "whitelist" };
  }

  const blockedDomains = Array.isArray(policy.blockedDomains) ? policy.blockedDomains : [];
  const hit = blockedDomains.some((domain) => matchesDomain(host, domain));
  return hit ? { blocked: true, host, reason: "blocklist" } : { blocked: false };
}

async function getState() {
  return chrome.storage.local.get([
    "apiBaseUrl",
    "accessToken",
    "refreshToken",
    "email",
    "deviceId",
    "policy",
    "lastSyncAt",
    "syncError",
  ]);
}

async function registerWebDevice(apiBaseUrl, accessToken) {
  const res = await fetch(`${apiBaseUrl}/api/devices/register`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Browser Extension",
      platform: "web",
      appVersion: "1.0.0",
    }),
  });
  if (res.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Device register failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  if (!data.id) {
    throw new Error("Device register response missing id");
  }
  return data.id;
}

async function refreshSupabaseToken(refreshToken) {
  const res = await fetch(
    `${DEFAULT_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
    {
      method: "POST",
      headers: {
        apikey: DEFAULT_SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
  );
  if (!res.ok) {
    throw new Error("Session expired. Please sign in again.");
  }
  const data = await res.json();
  if (!data.access_token) {
    throw new Error("Refresh response missing access_token.");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    email: data.user?.email || null,
  };
}

async function withValidToken(fn) {
  const state = await getState();
  if (!state.accessToken) {
    throw new Error("Not signed in");
  }
  try {
    return await fn(state.accessToken, state);
  } catch (err) {
    if (err.message !== "UNAUTHORIZED" || !state.refreshToken) {
      throw err;
    }
    const refreshed = await refreshSupabaseToken(state.refreshToken);
    const updated = {
      ...state,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      email: refreshed.email || state.email,
    };
    await chrome.storage.local.set({
      accessToken: updated.accessToken,
      refreshToken: updated.refreshToken,
      email: updated.email,
    });
    return fn(updated.accessToken, updated);
  }
}

async function syncPolicyNow() {
  const state = await getState();
  if (!state.accessToken) {
    return { signedIn: false };
  }

  const apiBaseUrl = (state.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, "");

  try {
    const policy = await withValidToken(async (token, current) => {
      let deviceId = current.deviceId;
      if (!deviceId) {
        deviceId = await registerWebDevice(apiBaseUrl, token);
        await chrome.storage.local.set({ deviceId });
      }

      let res = await fetch(
        `${apiBaseUrl}/api/agent/policy?deviceId=${encodeURIComponent(deviceId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );

      if (res.status === 403 || res.status === 404) {
        deviceId = await registerWebDevice(apiBaseUrl, token);
        await chrome.storage.local.set({ deviceId });
        res = await fetch(
          `${apiBaseUrl}/api/agent/policy?deviceId=${encodeURIComponent(deviceId)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          },
        );
      }

      if (res.status === 401) {
        throw new Error("UNAUTHORIZED");
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Policy sync failed (${res.status}): ${text}`);
      }
      return res.json();
    });

    await chrome.storage.local.set({
      policy,
      lastSyncAt: Date.now(),
      syncError: null,
    });
    await enforceAllOpenTabs(policy, apiBaseUrl);
    return { signedIn: true, policy };
  } catch (err) {
    await chrome.storage.local.set({ syncError: err.message || String(err) });
    return { signedIn: true, error: err.message || String(err) };
  }
}

async function enforceTab(tabId, rawUrl, policyOverride, apiBaseOverride) {
  if (!tabId || !rawUrl) return;
  const blockedPagePrefix = chrome.runtime.getURL("blocked.html");
  if (rawUrl.startsWith(blockedPagePrefix)) return;

  const state = policyOverride
    ? { policy: policyOverride, apiBaseUrl: apiBaseOverride }
    : await getState();
  const check = shouldBlockUrl(rawUrl, state.policy, state.apiBaseUrl);
  if (!check.blocked) return;

  const target = `${blockedPagePrefix}?site=${encodeURIComponent(check.host)}&reason=${encodeURIComponent(check.reason)}`;
  await chrome.tabs.update(tabId, { url: target }).catch(() => {});
}

async function enforceAllOpenTabs(policy, apiBaseUrl) {
  if (!policy || !policy.lockActive) return;
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id && tab.url) {
      await enforceTab(tab.id, tab.url, policy, apiBaseUrl);
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC_ALARM_NAME, { periodInMinutes: 0.5 });
  syncPolicyNow();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(SYNC_ALARM_NAME, { periodInMinutes: 0.5 });
  syncPolicyNow();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM_NAME) {
    syncPolicyNow();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab?.url;
  if (url) {
    enforceTab(tabId, url);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab?.url) {
    enforceTab(tabId, tab.url);
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "SIGN_IN") {
      const apiBaseUrl = (msg.apiBaseUrl || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, "");
      const res = await fetch(`${DEFAULT_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          apikey: DEFAULT_SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: String(msg.email || "").trim(),
          password: String(msg.password || ""),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.access_token) {
        throw new Error(data.error_description || data.msg || "Sign in failed");
      }
      await chrome.storage.local.set({
        apiBaseUrl,
        accessToken: data.access_token,
        refreshToken: data.refresh_token || null,
        email: data.user?.email || String(msg.email || "").trim(),
        deviceId: null,
        syncError: null,
      });
      const result = await syncPolicyNow();
      sendResponse({ ok: true, ...result });
      return;
    }

    if (msg?.type === "SYNC_NOW") {
      const result = await syncPolicyNow();
      sendResponse({ ok: !result.error, ...result });
      return;
    }

    if (msg?.type === "ACTIVATE_PASS") {
      const state = await getState();
      const apiBaseUrl = (state.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
      await withValidToken(async (token) => {
        const res = await fetch(`${apiBaseUrl}/api/agent/unlock-pass`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ minutes: Number(msg.minutes || 10) }),
        });
        if (res.status === 401) throw new Error("UNAUTHORIZED");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Unlock pass failed (${res.status})`);
        }
      });
      const result = await syncPolicyNow();
      sendResponse({ ok: !result.error, ...result });
      return;
    }

    if (msg?.type === "SIGN_OUT") {
      await chrome.storage.local.clear();
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "Unknown command" });
  })().catch((err) => {
    sendResponse({ ok: false, error: err.message || String(err) });
  });
  return true;
});
