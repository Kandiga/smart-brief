# Changelog

## 1.1.0 — 2026-07-18

**Quick Capture** — Smart Brief can now be driven from anywhere on the Mac, **without ever
leaving the screen you are looking at**:

- Global two-key shortcut (default **⌥B**, changeable in Settings) opens a screen-area
  selection overlay: frozen frame, gentle dim, crosshair, live pixel dimensions, Esc to
  cancel. Captures happen on the display under the cursor at its native (Retina) resolution;
  the selection is constrained to that display.
- After selecting, **you stay exactly where you are**. The capture is presented with a
  frame and a shadow over a dimmed backdrop so it clearly reads as an image you are marking
  up; a selection that fits stays exactly where it was taken at 1:1, and a larger one (a
  whole screen) is scaled down and centred so there is always a margin and room for the
  floating toolbar. The overlay hosts the real editor — same canvas,
  tools, colours, undo/redo and autosave — plus a **floating instruction composer** next to
  each numbered region (auto-flips so it never covers the region, draggable, ⌘↩ done / Esc
  collapse, prev/next navigation, hover previews). "Note" adds one overall message.
- Pressing **Done** (or ⌘↩) is the only thing that brings the app forward: the finished
  brief opens in Smart Brief, ready to export.
- Captures are ordinary projects: same repository, revisions, tombstones and media GC, and
  autosaved while you annotate. Cancelling before a selection creates nothing; discarding
  afterwards removes the project and its screenshot completely (asking first once you have
  marked something) — no ghost drafts, no orphan media.
- **Menu-bar mode** (on by default): a tray item with Open / Quick Capture / Library / Quit,
  and the app stays alive with the shortcut armed when the window is closed.
- Screen Recording permission is detected and explained in-app, with a one-click jump to
  the right System Settings pane and a recheck when you come back.

**Export AI Brief ZIP** — a new export path (alongside HTML/JPG/PDF/clipboard, which are
unchanged) that produces a self-contained package for AI agents:

- `README.md` (orientation for the agent), `manifest.json` (schema 1.0), `brief.md`
  (human-readable instructions with coordinates), `project-preview.jpg`, and per page:
  the untouched `original` image at source resolution, an `annotated.png` render with the
  numbered markers, and padded `regions/region-NNN.png` crops cut from the original pixels.
- Region numbers and coordinates match across the annotated image, Markdown, JSON and crop
  filenames; bounds are given in source pixels and normalized 0–1, independent of any zoom.
- Strict content contract: no internal ids, paths, revisions, or machine metadata. The
  manifest is verified against the actual package contents on every export. Over-limit
  packages (>100 MB) are refused with clear options (e.g. exporting without crops) instead
  of silently downscaling originals; the ZIP is written via temp file + atomic rename.

**Real Settings** — the Settings dialog now actually configures: capture shortcut (with
conflict detection and clear errors), launch at login, menu-bar mode, default export
folder, region-crop padding, whether to include crops in the ZIP, and copying the ZIP path
to the clipboard after export. Settings live in an atomic `settings.json` owned by the
main process.

**Dark mode** — the whole UI (editor, capture mode, dialogs, floating panels) follows the
system appearance automatically via a tokenized dark palette; the window background matches
so there is no flash on launch.

**Multi-display capture** — the capture overlay now appears on **every** display at once,
each frozen at its own native resolution and scale factor; drag on whichever screen you
want. Esc anywhere cancels all; focus leaving the capture entirely cancels cleanly. A single
selection still cannot span two displays.

**Signing options** — two ready-made configs: `npm run package:dev-signed` (free self-signed
certificate; stable app identity so the Screen Recording permission survives rebuilds, no
Apple account needed) and `npm run package:signed` (Developer ID + hardened runtime +
notarization for distribution; activates via APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD /
APPLE_TEAM_ID env vars).

**Fixes**

- **Captures no longer come out as a picture of an empty desktop.** macOS reports Screen
  Recording as "granted" from a stale permission entry — which an unsigned rebuild triggers
  every time, because such a build is identified by its own binary hash — while actually
  withholding every other app's pixels. The result was a capture of just the wallpaper, menu
  bar and Dock, with no warning. `npm run package:dev-signed` gives the app
  a stable identity so the permission stops being lost in the first place; that build now
  ships entitlements disabling library validation, without which a self-signed Apple Silicon
  build cannot load its own Electron framework.
- **Captures are now pixel-perfect.** The saved screenshot was previously cropped from the
  `desktopCapturer` frame, which macOS renders as a scaled-down *preview* — the result came
  out visibly soft, roughly half resolution on Retina. The actual grab now goes through
  macOS' own `screencapture` tool on the selected region, writing real framebuffer pixels
  at native resolution (verified: a 400×200-point selection produces an 800×400px image on
  a 2× display). The overlay excludes itself from screen capture, so it can stay on screen
  during the grab without ever photographing its own dim layer.

- The save indicator now distinguishes `Edited` (changes waiting for the debounce) from
  `Saving…`, `Saved locally` and `Save failed`.
- Discarding a never-saved capture no longer leaves its screenshot behind in `media/`
  (flush-before-delete so media GC always sees the references).

Tests: 75 unit tests (was 35) and 11 e2e tests (was 8), including capture ZIP content
verification, ghost-project and stale-autosave regression coverage for captures.

## 1.0.2 — 2026-07-18

- Export now also copies the brief image to the system clipboard: the "Continuous JPG" export
  copies the first sheet automatically, and a new "Copy image to clipboard" action copies without
  writing a file — so you can paste the brief straight into another app.
- Deeper, smoother canvas zoom: trackpad pinch (and ⌘/Ctrl-scroll) now zooms proportionally to
  the gesture speed, and the maximum zoom was raised from 8× to 40× for inspecting fine detail.

## 1.0.1 — 2026-07-17

- Standard macOS interface zoom: ⌘+ / ⌘= zoom the entire UI in, ⌘− zooms out, ⌘0 resets to
  actual size (View menu accelerators, like every Mac app). The zoom level is clamped to a sane
  range and persists across app restarts. Canvas zoom remains available via the toolbar,
  trackpad pinch and ⌘-scroll.

## 1.0.0 — 2026-07-17

Initial release.

- Canvas-first visual brief editor: numbered regions with linked instruction cards, arrows,
  freehand pen, boxes, ellipses; 8-color palette and 4 stroke widths; edit/move tools with
  selection handles; zoom (pinch / ⌘-scroll / toolbar), pan (Move tool or Space+drag),
  fit-to-view, focus mode.
- Screenshot import via drag & drop, file picker (⌘O), and clipboard paste (⌘V); multiple
  images per import; insert between existing pages.
- Blank 1500×900 canvas pages with placed images: move, resize, layer ordering
  (front/forward/backward/back), annotations over the composition.
- Multi-page projects: reorder, duplicate, delete, per-page titles, per-page overall message,
  per-page undo/redo (100 steps, coalesced text edits), active page restored on relaunch.
- Project library: thumbnails, page/region counts, last-edited dates, current-project badge,
  search, open/duplicate/delete (with confirmation), sorted by recency.
- Local-first persistence: debounced autosave with atomic writes and `.bak` recovery copies,
  revision checks against stale saves, tombstoned deletions that survive restarts, ghost-draft
  suppression, corrupt-file quarantine + recovery, media stored as files with GC.
- Exports: self-contained offline HTML, continuous JPG (auto-split into numbered parts when
  very tall), and clean visual PDF — content limited strictly to the brief itself.
- macOS packaging: unsigned arm64 `.app` and DMG, custom icon, hiddenInset title bar,
  Retina-correct canvas rendering.
- Security: context isolation, sandboxed renderer, strict CSP, validated IPC, escaped export
  text, denied navigation/window-open/permission requests.
- Tests: 35 unit tests (Vitest) and 7 end-to-end tests (Playwright driving the real app),
  including deletion-regression, ghost-draft, export-content and restart-persistence coverage.
