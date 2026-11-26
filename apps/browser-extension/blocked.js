const DEFAULT_API_BASE_URL = "https://focusgate-blue.vercel.app";

async function init() {
  const params = new URLSearchParams(window.location.search);
  const site = params.get("site") || "this site";
  const state = await chrome.storage.local.get(["policy", "apiBaseUrl"]);
  const isVi = state.policy?.language === "vi";
  const earned = Number(state.policy?.earnedMinutesBalance ?? 0);

  document.getElementById("headline").textContent = isVi
    ? `Trang “${site}” đang bị khóa`
    : `“${site}” is locked`;
  document.getElementById("message").textContent = isVi
    ? "Hãy hoàn thành các nhiệm vụ Bắt buộc trong kế hoạch hôm nay để nhận thời gian giải trí."
    : "Finish your Must-Do tasks and verified focus sessions to unlock entertainment sites.";

  const plannerBtn = document.getElementById("plannerBtn");
  plannerBtn.textContent = isVi ? "Mở Kế hoạch FocusGate" : "Open FocusGate Planner";
  plannerBtn.addEventListener("click", () => {
    const base = (state.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
    window.location.href = `${base}/planner`;
  });

  const passBtn = document.getElementById("passBtn");
  if (earned >= 10) {
    passBtn.style.display = "inline-block";
    passBtn.textContent = isVi
      ? `Dùng thẻ mở khóa 10 phút (còn ${earned}p)`
      : `Use 10m Earned Time Pass (${earned}m left)`;
    passBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "ACTIVATE_PASS", minutes: 10 }, (res) => {
        if (res?.ok) {
          window.location.href = `https://${site}`;
        } else {
          document.getElementById("errorBox").textContent =
            res?.error || (isVi ? "Không thể mở khóa lúc này." : "Could not activate unlock pass.");
        }
      });
    });
  }
}

init();

// FocusGate 11.0: Live Status Clock on blocked.html
(function initBlockedClock() {
  const el = document.getElementById("liveClock");
  if (!el) return;
  const tick = () => {
    const now = new Date();
    el.textContent = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  };
  tick();
  setInterval(tick, 15000);
})();
