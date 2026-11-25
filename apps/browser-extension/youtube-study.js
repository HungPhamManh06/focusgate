(function () {
  const CLASS_NAME = "fg-yt-study-mode";

  function ensureBadge() {
    if (document.getElementById("fg-study-badge")) return;
    const badge = document.createElement("div");
    badge.id = "fg-study-badge";
    badge.textContent = "🛡️ FocusGate · YouTube Study Mode";
    document.body?.appendChild(badge);
  }

  function applyState(enabled) {
    if (enabled) {
      document.documentElement.classList.add(CLASS_NAME);
      if (document.body) ensureBadge();
    } else {
      document.documentElement.classList.remove(CLASS_NAME);
    }
  }

  function refreshFromStorage() {
    chrome.storage.local.get(["youtubeStudyMode", "policy"], (data) => {
      const manual = Boolean(data.youtubeStudyMode);
      const gateLocked = Boolean(data.policy && data.policy.lockActive);
      applyState(manual || gateLocked);
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
