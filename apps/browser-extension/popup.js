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

  const shieldEl = document.getElementById("shieldLabel");
  if (shieldEl) {
    const blockedAttempts = Number(policy?.blockedAttemptsToday ?? 0);
    shieldEl.textContent =
      lang === "vi"
        ? `🛡️ Đã bảo vệ ${blockedAttempts} lần hôm nay`
        : `🛡️ Shielded ${blockedAttempts} distractions today`;
  }
  const ringArc = document.getElementById("ringArc");
  if (ringArc) {
    ringArc.setAttribute("stroke", locked ? "#f87171" : "#34d399");
    ringArc.setAttribute("stroke-dashoffset", locked ? "28" : "0");
  }
  const breakBtn = document.getElementById("breakBtn");
  if (breakBtn) {
    breakBtn.textContent = lang === "vi" ? "Nghỉ ngắn 5 phút" : "5m Quick Break";
  }

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

document.getElementById("breakBtn")?.addEventListener("click", async () => {
  const { apiBaseUrl } = await chrome.storage.local.get(["apiBaseUrl"]);
  chrome.tabs.create({ url: `${apiBaseUrl || DEFAULT_API_BASE_URL}/focus?break=5` });
});

// FocusGate 11.0: 1-Tap Ambient Brown Noise (Web Audio API)
let fgNoiseCtx = null;
let fgNoiseRunning = false;
document.getElementById("noiseBtn")?.addEventListener("click", () => {
  const btn = document.getElementById("noiseBtn");
  if (fgNoiseRunning && fgNoiseCtx) {
    try { fgNoiseCtx.close(); } catch {}
    fgNoiseCtx = null;
    fgNoiseRunning = false;
    if (btn) btn.textContent = "Ambient Brown Noise: OFF";
    return;
  }
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
      data[i] *= 2.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0.14;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    fgNoiseCtx = ctx;
    fgNoiseRunning = true;
    if (btn) btn.textContent = "Ambient Brown Noise: ON";
  } catch {
    // ignore
  }
});

// FocusGate 9.0: 4-Theme Popup Switcher + Current Tab Quick-Action Bar
const POPUP_THEMES = {
  espresso: "linear-gradient(160deg, #161012 0%, #100b0c 60%, #1d1113 100%)",
  matcha: "linear-gradient(160deg, #102218 0%, #0a1610 60%, #152b1f 100%)",
  nordic: "linear-gradient(160deg, #0c182d 0%, #08101e 60%, #13223d 100%)",
  crimson: "linear-gradient(160deg, #241315 0%, #140b0c 60%, #2a1814 100%)",
};

async function applyPopupTheme(theme) {
  const bg = POPUP_THEMES[theme] || POPUP_THEMES.espresso;
  document.body.style.background = bg;
  await chrome.storage.local.set({ popupTheme: theme });
}

document.querySelectorAll(".theme-dot").forEach((btn) => {
  btn.addEventListener("click", () => {
    const t = btn.getAttribute("data-theme") || "espresso";
    void applyPopupTheme(t);
  });
});

(async () => {
  const { popupTheme, policy } = await chrome.storage.local.get(["popupTheme", "policy"]);
  if (popupTheme && POPUP_THEMES[popupTheme]) {
    document.body.style.background = POPUP_THEMES[popupTheme];
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && /^https?:\/\//i.test(tab.url)) {
      const host = new URL(tab.url).hostname.replace(/^www\./, "");
      const bar = document.getElementById("currentTabBar");
      const hostEl = document.getElementById("currentTabHost");
      const stateEl = document.getElementById("currentTabState");
      if (bar && hostEl && stateEl) {
        const blockedList = Array.isArray(policy?.blockedDomains) ? policy.blockedDomains : [];
        const isBlocked = blockedList.some((d) => host.includes(String(d).toLowerCase()));
        const isVi = policy?.language === "vi";
        hostEl.textContent = host;
        stateEl.textContent = isBlocked
          ? (isVi ? "Đang trong danh sách chặn" : "In block list")
          : (isVi ? "Không bị chặn" : "Allowed");
        bar.style.display = "block";
      }
    }
  } catch {
    // ignore
  }
  const quoteEl = document.getElementById("quoteFooter");
  if (quoteEl) {
    const isVi = policy?.language === "vi";
    const quotes = isVi
      ? ["Một phiên sâu giá trị hơn mười ý định dở dang.", "Bảo vệ giờ đầu tiên của ngày.", "Làm trước, hưởng trọn sau."]
      : ["One finished deep block beats ten intentions.", "Guard your first focused hour.", "Earn your freedom first."];
    quoteEl.textContent = `“${quotes[new Date().getDate() % quotes.length]}”`;
  }
})();

document.getElementById("quickTaskForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("quickTaskInput");
  const msg = document.getElementById("quickTaskMsg");
  const title = input?.value?.trim();
  if (!title) return;
  const { accessToken, apiBaseUrl, policy } = await chrome.storage.local.get(["accessToken", "apiBaseUrl", "policy"]);
  const isVi = policy?.language === "vi";
  if (!accessToken) return;
  const base = (apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/api/agent/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ title, kind: "must_do", requiredFocusMinutes: 25, addToTodayPlan: true }),
    });
    if (!res.ok) throw new Error("Failed");
    input.value = "";
    if (msg) msg.textContent = isVi ? `✓ Đã thêm "${title}" vào hôm nay.` : `✓ Added "${title}" to today.`;
  } catch {
    if (msg) msg.textContent = isVi ? "Không thể thêm việc lúc này." : "Could not add task right now.";
  }
});
