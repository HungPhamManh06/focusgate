const API_BASE = "https://focusgate-blue.vercel.app";
const SUPABASE_URL = "https://dyfdeceiszmxozdqugon.supabase.co";
const SUPABASE_KEY = "sb_publishable_TPpxronGIazapp2ylFORIw_ejce1q9C";

const DEFAULT_BLOCKED = [
  "youtube.com",
  "facebook.com",
  "tiktok.com",
  "instagram.com",
  "reddit.com",
];

async function getState() {
  return chrome.storage.local.get([
    "accessToken",
    "refreshToken",
    "email",
    "deviceId",
    "policy",
    "lastSyncAt",
  ]);
}

async function signInAndRegister(email, password) {
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  if (!authRes.ok) {
    const text = await authRes.text();
    throw new Error(`Sign-in failed (${authRes.status}): ${text}`);
  }
  const auth = await authRes.json();
  const accessToken = auth.access_token;
  const refreshToken = auth.refresh_token ?? null;

  const regRes = await fetch(`${API_BASE}/api/devices/register`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `Browser Extension (${navigator.platform || "Chrome"})`,
      platform: "web",
    }),
  });
  if (!regRes.ok) {
    const text = await regRes.text();
    throw new Error(`Device registration failed (${regRes.status}): ${text}`);
  }
  const reg = await regRes.json();
  await chrome.storage.local.set({
    accessToken,
    refreshToken,
    email,
    deviceId: reg.deviceId,
  });
  await syncPolicy();
}

async function syncPolicy() {
  const state = await getState();
  if (!state.accessToken || !state.deviceId) return null;

  const res = await fetch(
    `${API_BASE}/api/agent/policy?deviceId=${encodeURIComponent(state.deviceId)}`,
    {
      headers: {
        Authorization: `Bearer ${state.accessToken}`,
      },
    },
  );
  if (!res.ok) return null;
  const policy = await res.json();
  await chrome.storage.local.set({
    policy,
    lastSyncAt: new Date().toISOString(),
  });
  await applyBlockingRules(policy);
  return policy;
}

async function applyBlockingRules(policy) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);

  const addRules = [];
  if (policy && policy.lockActive) {
    const domains =
      Array.isArray(policy.blockedDomains) && policy.blockedDomains.length > 0
        ? policy.blockedDomains
        : DEFAULT_BLOCKED;

    let id = 1;
    for (const domain of domains) {
      const clean = String(domain).trim().toLowerCase();
      if (!clean) continue;
      addRules.push({
        id: id++,
        priority: 1,
        action: {
          type: "redirect",
          redirect: { extensionPath: `/blocked.html?domain=${encodeURIComponent(clean)}` },
        },
        condition: {
          urlFilter: `||${clean}`,
          resourceTypes: ["main_frame"],
        },
      });
    }
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules,
  });
}

function shouldBlockUrl(urlStr, policy) {
  if (!policy || !policy.lockActive) return null;
  let url;
  try {
    url = new URL(urlStr);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();

  if (
    host === "focusgate-blue.vercel.app" ||
    host.endsWith(".supabase.co") ||
    host === "localhost"
  ) {
    return null;
  }

  if (policy.whitelistFocusMode && policy.activeFocusSession) {
    const allowed = Array.isArray(policy.allowedDomains) ? policy.allowedDomains : [];
    const isAllowed = allowed.some(
      (d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`),
    );
    if (!isAllowed) return host;
  }

  const blocked =
    Array.isArray(policy.blockedDomains) && policy.blockedDomains.length > 0
      ? policy.blockedDomains
      : DEFAULT_BLOCKED;
  const hit = blocked.find(
    (d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`),
  );
  return hit ?? null;
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url;
  if (!url) return;
  const { policy } = await getState();
  const matched = shouldBlockUrl(url, policy);
  if (matched) {
    chrome.tabs.update(tabId, {
      url: chrome.runtime.getURL(`blocked.html?domain=${encodeURIComponent(matched)}`),
    });
  }
});

chrome.alarms.create("focusgate-sync", { periodInMinutes: 0.25 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "focusgate-sync") {
    void syncPolicy();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "SIGN_IN") {
        await signInAndRegister(msg.email, msg.password);
        sendResponse({ ok: true });
      } else if (msg.type === "SIGN_OUT") {
        await chrome.storage.local.clear();
        await applyBlockingRules(null);
        sendResponse({ ok: true });
      } else if (msg.type === "SYNC_NOW") {
        const policy = await syncPolicy();
        sendResponse({ ok: true, policy });
      } else if (msg.type === "ACTIVATE_UNLOCK_PASS") {
        const state = await getState();
        const res = await fetch(`${API_BASE}/api/agent/unlock-pass`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${state.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ minutes: msg.minutes ?? 10 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unlock pass failed");
        await syncPolicy();
        sendResponse({ ok: true, data });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true;
});
