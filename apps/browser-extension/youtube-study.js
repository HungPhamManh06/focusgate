(function () {
  const CLASS_NAME = "fg-yt-study-mode";

  function ensureBadge(manualActive) {
    let badge = document.getElementById("fg-study-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "fg-study-badge";
      badge.style.cssText =
        "position:fixed;right:18px;bottom:18px;z-index:2147483640;display:flex;align-items:center;gap:8px;padding:7px 13px;border-radius:999px;background:rgba(20,14,15,0.88);color:#f5eeee;border:1px solid rgba(248,113,113,0.45);font:600 12px/1.2 system-ui,-apple-system,sans-serif;backdrop-filter:blur(10px);box-shadow:0 8px 24px rgba(0,0,0,0.35);cursor:pointer;user-select:none;";
      badge.addEventListener("click", () => {
        chrome.storage.local.get(["youtubeStudyMode"], (d) => {
          chrome.storage.local.set({ youtubeStudyMode: !Boolean(d.youtubeStudyMode) });
        });
      });
      document.body?.appendChild(badge);
    }
    badge.textContent = manualActive
      ? "🎓 FocusGate Study Mode · ON (Click to toggle)"
      : "🛡️ FocusGate Gate Active · Study Mode";
  }

  function removeBadge() {
    document.getElementById("fg-study-badge")?.remove();
  }

  function applyState(enabled, manualActive) {
    if (enabled) {
      document.documentElement.classList.add(CLASS_NAME);
      if (document.body) ensureBadge(manualActive);
    } else {
      document.documentElement.classList.remove(CLASS_NAME);
      removeBadge();
    }
  }

  function refreshFromStorage() {
    chrome.storage.local.get(["youtubeStudyMode", "policy"], (data) => {
      const manual = Boolean(data.youtubeStudyMode);
      const gateLocked = Boolean(data.policy && data.policy.lockActive);
      applyState(manual || gateLocked, manual);
    });
  }

  refreshFromStorage();
  document.addEventListener("DOMContentLoaded", refreshFromStorage);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.youtubeStudyMode || changes.policy)) {
      refreshFromStorage();
    }
  });
})();
