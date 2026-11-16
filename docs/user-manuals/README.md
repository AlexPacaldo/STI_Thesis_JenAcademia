# JEN Academia user manuals

Edition 2.0 — 16 November 2026.

Open [the manual directory](index.html) and choose a role. Each role has a standalone HTML guide and matching printable PDF. The root USER_MANUAL files are the directory; the root ADMIN_USER_MANUAL files remain the administrator guide.

## Maintain the manuals

1. Check interface labels and permissions against the current role screens and `docs/SYSTEM_FEATURES_AND_RULES.md`.
2. Update content in `scripts/build-user-manuals.py` and run `python scripts/build-user-manuals.py`.
3. Capture illustrations with `node scripts/capture-manual-screens.mjs` when screens change. This uses the real frontend with intercepted, fictional API responses. It does not connect to a database or validate deployed backend behavior. All external requests are blocked except mocked API responses.
4. Run `node scripts/render-manuals.mjs` to regenerate PDFs, validate links/images and render chapter previews for visual review.
5. Inspect the generated previews and fix layout issues before distributing the manuals.

Dependencies: the existing frontend Vite install, root `puppeteer-core`, Python standard library and an installed Chrome browser. `BROWSER_PATH` can select another Chromium browser. No Word/document skill dependencies are required because deliverables use the repository’s existing HTML/PDF format.

## Illustration provenance

PNG screenshots show actual React pages with fictional sample identities and records. `images/capture-report.json` records the captured routes and browser errors. No screenshot is evidence of production behavior. SVG workflow illustrations are authored inside the HTML and labelled as diagrams. Integration-dependent email, LINE, AI, recording and meeting behavior is described with its relevant conditions.
