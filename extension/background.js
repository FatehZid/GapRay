// Turns GapRay on or off in a tab.
// content.js toggles itself if it is already on the page.
async function toggle(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch (err) {
    // Chrome blocks extensions on chrome:// pages and the Web Store.
    console.warn("GapRay can't run on this page:", err.message);
  }
}

// Cmd/Ctrl+Shift+X.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-gapray" && tab) toggle(tab.id);
});

// "Activate GapRay" in the toolbar menu.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "toggle") return;
  toggle(msg.tabId).then(() => sendResponse());
  return true;
});
