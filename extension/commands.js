// Must match the command name in manifest.json.
const TOGGLE_COMMAND = "toggle-gapray";

// The shortcut Chrome actually assigned, already formatted for the OS, or ""
// when the user removed it.
export async function getShortcut() {
  const commands = await chrome.commands.getAll();
  return commands.find(({ name }) => name === TOGGLE_COMMAND)?.shortcut ?? "";
}
