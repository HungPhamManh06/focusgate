const params = new URLSearchParams(window.location.search);
const domain = params.get("domain");
if (domain) {
  document.getElementById("desc").textContent =
    `${domain} is blocked until your Today's Plan is complete.`;
}

document.getElementById("unlock-pass-btn").addEventListener("click", () => {
  const msg = document.getElementById("msg");
  msg.textContent = "Activating 10m Unlock Pass...";
  chrome.runtime.sendMessage({ type: "ACTIVATE_UNLOCK_PASS", minutes: 10 }, (res) => {
    if (!res?.ok) {
      msg.textContent = res?.error || "Insufficient Earned Time.";
    } else {
      window.history.back();
    }
  });
});
