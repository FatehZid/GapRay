# GapRay Roadmap

## Principles

- The core stays free and open source forever.
- Charge only for services that cost money to run. Never charge for the core design tools.
- Local first: no accounts, no servers, no data leaves the browser.
- DevTools for designers, minus the clutter. We win by being smart, not by having more features.
- Start simple and add only what real use asks for.

## V0 · MVP (current)

- **Toggle:** toolbar icon or `Alt+Shift+M` turns it on, `Esc` exits.
- **Drag:** x-ray an area to show sizes, hatched padding, gaps between items and radius.
- **Click:** one clean card for an element: font, size, weight, line height, color, dimensions, padding, radius.
- **Permissions:** `activeTab` and `scripting` only.

Done when: Fateh has tested it on real sites he picks and the numbers match Chrome DevTools.

## V0.x · Polish (driven by what breaks)

- The overlay stays correct when you scroll or resize.
- Click a value to copy it.
- Readable on light and dark sites.

## V1 · Figma habits

- Hold `Alt` and hover to see the distance between two elements.
- Export the x-rayed area as a PNG.

## Later (only on real demand)

- Annotations.
- Firefox and Safari.
- Paid cloud, only where hosting costs money: shared reports, team audits, AI layout checks.

## Not doing

- Accounts, a backend, analytics or tracking in V0 and V1.
- New permissions without a clear reason. In Chrome, adding permission warnings disables the extension until each user approves them again.
