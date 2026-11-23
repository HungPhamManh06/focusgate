const authView = document.getElementById("auth-view");
const mainView = document.getElementById("main-view");
const statusBox = document.getElementById("status-box");
const errorBox = document.getElementById("error-box");

async function render() {
  const state = await chrome.storage.local.get([
    "accessToken",
    "email",
    "policy",
    "lastSyncAt",
  ]);
  errorBox.textContent = "";

  if (!state.accessToken) {
    authView.style.display = "block";
    mainView.style.display = "none";
    return;
  }

  authView.style.display = "none";
  mainView.style.display = "block";

  const p = state.policy;
  if (!p) {
    statusBox.textContent = `Signed in as ${state.email || "user"}. Waiting for sync...`;
  } else {
    const lockText = p.lockActive ? "LOCKED (Tasks pending)" : "UNLOCKED";
    const earned = p.earnedMinutesBalance ?? 0;
    statusBox.innerHTML = `
      <div><strong>${lockText}</strong></div>
      <div>Account: ${state.email || "Connected"}</div>
      <div>Earned Time: ${earned}m</div>
      <div>Blocked sites: ${(p.blockedDomains || []).length}</div>
    `;
  }
}

document.getElementById("sign-in-btn").addEventListener("click", () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  errorBox.textContent = "";
  chrome.runtime.sendMessage({ type: "SIGN_IN", email, password }, (res) => {
    if (!res?.ok) {
      errorBox.textContent = res?.error || "Sign-in failed.";
    } else {
      void render();
    }
  });
});

document.getElementById("sync-btn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SYNC_NOW" }, () => void render());
});

document.getElementById("unlock-btn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "ACTIVATE_UNLOCK_PASS", minutes: 10 }, (res) => {
    if (!res?.ok) errorBox.textContent = res?.error || "Failed";
    void render();
  });
});

document.getElementById("open-web-btn").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://focusgate-blue.vercel.app/planner" });
});

document.getElementById("sign-out-btn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SIGN_OUT" }, () => void render());
});

void render();
