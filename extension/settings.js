document.getElementById("version").textContent = `v${chrome.runtime.getManifest().version}`;
const shortcut = document.getElementById("shortcut");

async function showShortcut() {
  const commands = await chrome.commands.getAll();
  const cmd = commands.find((c) => c.name === "toggle-gapray");
  shortcut.textContent = cmd && cmd.shortcut ? cmd.shortcut : "Not set";
}

// Chrome doesn't let extensions set shortcuts, so open its shortcut page.
document.getElementById("change").addEventListener("click", () => {
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

// Refresh when the user comes back from Chrome's shortcut page.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) showShortcut();
});
showShortcut();
