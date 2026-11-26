const DEFAULT_API_BASE_URL = "https://focusgate-blue.vercel.app";

const STRINGS = {
  en: {
    subtitle: "Blocks distracting sites until today's plan is done.",
    password: "Password",
    signIn: "Sign in & Sync",
    locked: "Lock Active",
    unlocked: "Unlocked",
    account: "Account",
    blockedCount: (n) => `${n} blocked domains`,
    whitelistMode: (n) => `Whitelist focus mode (${n} allowed domains)`,
    earned: (m) => `Earned time: ${m}m`,
    syncNow: "Sync Now",
    usePass: "Use 10m Earned Time Pass",
    openWeb: "Open FocusGate Web",
    signOut: "Sign out",
  },
  vi: {
    subtitle: "Chặn trang giải trí cho đến khi xong kế hoạch hôm nay.",
    password: "Mật khẩu",
    signIn: "Đăng nhập & Đồng bộ",
    locked: "Đang khóa",
    unlocked: "Đã mở khóa",
    account: "Tài khoản",
    blockedCount: (n) => `${n} tên miền bị chặn`,
    whitelistMode: (n) => `Chế độ whitelist (${n} tên miền được phép)`,
    earned: (m) => `Thời gian tích lũy: ${m} phút`,
    syncNow: "Đồng bộ ngay",
    usePass: "Dùng thẻ 10 phút tích lũy",
    openWeb: "Mở Web FocusGate",
    signOut: "Đăng xuất",
  },
};

function sendMsg(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, resolve);
  });
}

async function render() {
  const state = await chrome.storage.local.get([
    "accessToken",
    "email",
    "policy",
    "syncError",
    "apiBaseUrl",
    "youtubeStudyMode",
  ]);
  const lang = state.policy?.language === "vi" ? "vi" : "en";
  const t = STRINGS[lang];
  const ytStudyBtn = document.getElementById("ytStudyBtn");
  if (ytStudyBtn) {
    const on = Boolean(state.youtubeStudyMode);
    ytStudyBtn.textContent =
      lang === "vi"
        ? `Chế độ YouTube Học tập: ${on ? "BẬT" : "TẮT"}`
        : `YouTube Study Mode: ${on ? "ON" : "OFF"}`;
  }

  document.getElementById("subtitle").textContent = t.subtitle;
  document.getElementById("passwordLabel").textContent = t.password;
  document.getElementById("signInBtn").textContent = t.signIn;
  document.getElementById("syncBtn").textContent = t.syncNow;
  document.getElementById("passBtn").textContent = t.usePass;
  document.getElementById("openWebBtn").textContent = t.openWeb;
  document.getElementById("signOutBtn").textContent = t.signOut;

  const signedOutView = document.getElementById("signedOutView");
  const signedInView = document.getElementById("signedInView");

  if (!state.accessToken) {
    signedOutView.style.display = "block";
    signedInView.style.display = "none";
    return;
  }

  signedOutView.style.display = "none";
  signedInView.style.display = "block";

  const policy = state.policy;
  const locked = policy ? Boolean(policy.lockActive) : true;
  const badge = document.getElementById("statusBadge");
  badge.textContent = locked ? t.locked : t.unlocked;
  badge.className = `status-pill ${locked ? "locked" : "unlocked"}`;

  document.getElementById("emailLabel").textContent = `${t.account}: ${state.email || "-"}`;

  const domainsEl = document.getElementById("domainsLabel");
  if (policy?.whitelistFocusMode) {
    const allowed = Array.isArray(policy.allowedDomains) ? policy.allowedDomains.length : 0;
    domainsEl.textContent = t.whitelistMode(allowed);
  } else {
    const blocked = Array.isArray(policy?.blockedDomains) ? policy.blockedDomains.length : 0;
    domainsEl.textContent = t.blockedCount(blocked);
  }

  const earned = Number(policy?.earnedMinutesBalance ?? 0);
  document.getElementById("earnedLabel").textContent = t.earned(earned);

  const passBtn = document.getElementById("passBtn");
  passBtn.disabled = earned < 10;

  document.getElementById("syncError").textContent = state.syncError || "";
}

document.getElementById("ytStudyBtn")?.addEventListener("click", async () => {
  const { youtubeStudyMode } = await chrome.storage.local.get(["youtubeStudyMode"]);
  const next = !youtubeStudyMode;
  await chrome.storage.local.set({ youtubeStudyMode: next });
  await render();
  if (next) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && tab.url && tab.url.includes("blocked.html") && tab.url.includes("youtube.com")) {
      await chrome.tabs.update(tab.id, { url: "https://www.youtube.com" });
    }
  }
});

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";
  const email = document.getElementById("emailInput").value;
  const password = document.getElementById("passwordInput").value;
  const res = await sendMsg({ type: "SIGN_IN", email, password });
  if (!res?.ok) {
    errEl.textContent = res?.error || "Sign in failed";
  }
  await render();
});

document.getElementById("syncBtn").addEventListener("click", async () => {
  await sendMsg({ type: "SYNC_NOW" });
  await render();
});

document.getElementById("passBtn").addEventListener("click", async () => {
  const res = await sendMsg({ type: "ACTIVATE_PASS", minutes: 10 });
  if (!res?.ok && res?.error) {
    document.getElementById("syncError").textContent = res.error;
  }
  await render();
});

document.getElementById("openWebBtn").addEventListener("click", async () => {
  const { apiBaseUrl } = await chrome.storage.local.get(["apiBaseUrl"]);
  const base = (apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  chrome.tabs.create({ url: `${base}/planner` });
});

document.getElementById("signOutBtn").addEventListener("click", async () => {
  await sendMsg({ type: "SIGN_OUT" });
  await render();
});

render();

document.getElementById("focusBtn")?.addEventListener("click", async () => {
  const { apiBaseUrl } = await chrome.storage.local.get(["apiBaseUrl"]);
  chrome.tabs.create({ url: `${apiBaseUrl || DEFAULT_API_BASE_URL}/focus` });
});
