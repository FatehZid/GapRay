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

// The shortcut Chrome actually assigned, already formatted for the OS.
async function showShortcut() {
  const commands = await chrome.commands.getAll();
  const shortcut = commands.find((c) => c.name === "toggle-gapray")?.shortcut;
  document.getElementById("shortcut").textContent = shortcut || "Not set";
}
