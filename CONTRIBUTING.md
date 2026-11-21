# Contributing to GapRay

Thanks for helping. GapRay is small on purpose, so please read this first.

## Before you start

- For a bug, open an issue with steps to reproduce.
- For a new feature or a big change, open an issue first so we can agree on it.
- Small fixes (typos, clear bugs) can go straight to a pull request.

## Rules

- Plain JavaScript, Manifest V3. No build step, no npm dependencies.
- No network calls, no remote code, no tracking.
- No new permissions without a clear reason.
- The overlay never changes the page and stays inside its Shadow DOM.
- Measurements must match Chrome DevTools.
- Motion uses transform and opacity only, and respects reduced motion.

## Run it locally

1. Fork and clone the repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the `extension` folder.
4. After each change, reload GapRay, then refresh the test page.

## Before you open a pull request

```bash
npx prettier --check .
node --check extension/content.js && node --check extension/background.js
```

- One change per pull request.
- Say what you changed, why, and how you tested it.
- Add screenshots for anything visual.
- Add a line under `Unreleased` in `CHANGELOG.md`.

## License

By contributing, you agree that your work is licensed under [GPL-3.0](LICENSE).
