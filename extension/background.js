// Toolbar click and Alt+Shift+M both fire action.onClicked.
// content.js toggles itself if it is already on the page.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
  } catch (err) {
    // Chrome blocks extensions on chrome:// pages and the Web Store.
    console.warn("GapRay can't run on this page:", err.message);
  }
});
