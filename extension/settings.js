import { getShortcut } from "./commands.js";

const { name, version } = chrome.runtime.getManifest();
document.title = `${name} settings`;
document.getElementById("app-name").textContent = name;
document.getElementById("app-version").textContent = `v${version}`;

showShortcut();

document.getElementById("change-shortcut").addEventListener("click", () => {
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

// The user may change the shortcut in another tab, then come back.
addEventListener("focus", showShortcut);

async function showShortcut() {
  document.getElementById("shortcut").textContent =
    (await getShortcut()) || "Not set";
}
