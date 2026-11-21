const toggleBtn = document.getElementById("toggle");
const label = document.getElementById("toggle-label");
document.getElementById("version").textContent = `v${chrome.runtime.getManifest().version}`;

let tabId = null;

// Ask the page if GapRay is on, to label the button. Fails on chrome:// pages.
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => !!document.querySelector("gapray-root"),
    });
    tabId = tab.id;
    if (result) label.textContent = "Turn off GapRay";
    toggleBtn.disabled = false;
  } catch {
    label.textContent = "Can't run on this page";
  }
})();

toggleBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "toggle", tabId });
  window.close();
});

document.getElementById("settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
