import { getShortcut } from "./commands.js";

const { name, version } = chrome.runtime.getManifest();
document.getElementById("app-name").textContent = name;
document.getElementById("app-version").textContent = `v${version}`;
document.getElementById("shortcut").textContent = await getShortcut();

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const toggle = document.getElementById("toggle");

// Ask the page if GapRay is on. On chrome:// pages this fails and the item stays disabled.
try {
  const [{ result: on }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => !!document.querySelector("gapray-root"),
  });
  if (on) document.getElementById("toggle-label").textContent = "Deactivate GapRay";
  toggle.disabled = false;
} catch {
  // Page can't be inspected.
}

toggle.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "toggle", tabId: tab.id });
  window.close();
});

document.getElementById("settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
