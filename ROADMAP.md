# GapRay Roadmap

## Principles

- The core stays free and open source forever.
- Charge only for services that cost money to run. Never charge for the core design tools.
- Local first: no accounts, no servers, no data leaves the browser.
- DevTools for designers, minus the clutter. We win by being smart, not by having more features.
- Start simple and add only what real use asks for.

## V0 · MVP (done)

- **Toggle:** toolbar icon or `Cmd/Ctrl+Shift+X` turns it on, `Esc` exits.
- **Hover:** outline and size of any element.
- **Click:** one clean card for an element: font, size, weight, line height, color, dimensions, padding, radius.
- **Drag:** live x-ray of an area: sizes, hatched padding, gaps between items, radius arcs, and the colors used.
- **Copy:** click any value to copy it, with a toast. Fails safely on plain http pages (localhost works).
- **Scroll and resize:** the overlay stays correct.
- **Light and dark:** readable on both.
- **Motion:** each item animates in once. Respects reduced motion.
- **Permissions:** `activeTab` and `scripting` only.

## V0.x · Polish (driven by what breaks)

- **Toolbar menu:** clicking the icon opens a menu: Turn on GapRay, Settings, version.
- **Settings page:** shows the current shortcut with a Change button that opens Chrome's shortcut settings.
- **Shortcut:** `Cmd/Ctrl+Shift+X` still turns GapRay on directly, without the menu.

## V1 · Figma habits (current)

- ✅ Hold `Alt` and hover to see the distance between two elements.
- Export the x-rayed area as a PNG.

## Later (only on real demand)

- Annotations.
- Firefox and Safari.
- Paid cloud, only where hosting costs money: shared reports, team audits, AI layout checks.

## Not doing

- Accounts, a backend, analytics or tracking in V0 and V1.
- New permissions without a clear reason. In Chrome, adding permission warnings disables the extension until each user approves them again.
