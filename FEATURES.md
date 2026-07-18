# Smart Brief — Full Feature Description (v1.1.0)

A complete inventory of what the app does today, verified against the source code
(2026-07-18). v1.1.0 adds Quick Capture, the AI Brief ZIP export, real Settings,
menu-bar mode and the four-state save indicator (see §12 and CHANGELOG.md).

## What it is

Smart Brief is a **local-first macOS desktop app** (Electron + React 18 + TypeScript +
react-konva + Zustand) for turning screenshots and reference images into clear visual
instructions — for humans and AI agents. You drop a screenshot, mark the areas you want
changed, attach a short message to each mark, optionally add one overall message per page,
and export. No accounts, no cloud, no forms; everything is saved automatically on the Mac.

Current version: **1.1.0** (unsigned arm64 `.app` + DMG in `release/`).

---

## 1. Getting images in

- **Drag & drop** anywhere in the app → each image becomes a new page.
- **Clipboard paste (⌘V)** — if the active page is a *blank* page, the image is placed as a
  movable object on it; otherwise it becomes a new page.
- **File picker (⌘O / "Add screenshot")** — multi-select; accepted extensions:
  `png, jpg, jpeg, webp, gif, bmp, avif` (drag/paste accepts any `image/*` MIME).
- **Blank canvas** — a fixed **1500×900** page you compose on by dropping/pasting images
  onto it. Dropped images land at the cursor; otherwise they're scaled to max 60% of the
  page and cascade-offset 24px per layer.
- **Insert between pages** — an "Insert screenshot here" row under each page ("Add next
  screenshot" on the last page).
- Max media file size: **200 MB** per image. Media is stored once as UUID-named files in
  the app's `media/` folder and referenced from project JSON.

## 2. Annotating (the canvas)

One Konva stage per page in a vertically scrolling document. Only the first 2 pages render
eagerly; the rest lazy-mount via IntersectionObserver (600px rootMargin).

**Tools** (toolbar, left to right): **Region**, **Arrow**, **Draw** (freehand pen),
**Box** (rectangle), **Circle** (ellipse), **Edit** (select/move/resize with transformer
handles), **Move** (pan). Default tool is Region.

- **Region** is the signature tool: draws a numbered dashed rectangle (badge radius 14,
  translucent fill); a matching **instruction card** appears in the side panel with the
  text field auto-focused. Numbers are always derived from array order — deleting a region
  renumbers the rest automatically. Minimum size to create: 5×5 px.
- **Arrow** — pointer size scales with stroke width; min length 6 px.
- **Draw** — freehand, point-thinned (min distance 2px), smoothed (tension 0.4), needs at
  least 2 vertices to persist.
- **Colors**: 8 fixed swatches — Coral `#e5484d`, Orange `#f76b15`, Yellow `#ffc53d`,
  Green `#46a758`, Teal `#12a594`, Blue `#0090ff`, Purple `#8e4ec6`, Ink `#1c2024`.
  No custom color picker.
- **Stroke widths**: 4 options — 2, 3, 5, 8 px.
- **Placed images** (blank pages) can be moved, resized, and layered — an overlay offers
  To front / Forward / Backward / To back / Remove when one is selected in Edit mode.
- **Zoom/pan**: trackpad pinch and ⌘/Ctrl-scroll zoom at the cursor (exponential,
  gesture-speed-proportional); plain scroll pans; Move tool or held Space pans. Zoom clamp
  **0.02×–40×**; Fit-to-view caps at 4×; a live "NN%" readout shows per canvas. Zoom/pan
  is saved per page (debounced 400 ms) and restored on relaunch.
- **Undo/redo**: per-page snapshot history, **100 steps**, with text-edit coalescing
  (1.2 s window). Menu ⌘Z/⇧⌘Z is context-sensitive: text-field undo when a field is
  focused, canvas undo otherwise.
- **Escape cascade**: cancels an in-progress stroke → closes export menu → settings →
  library → blurs text field → clears selection. Delete/Backspace removes the selected
  object.

## 3. Writing the brief

- One **instruction** per numbered region (auto-growing textarea, up to 160px tall);
  creating a region selects it and focuses its field.
- One optional **overall message** per page.
- Per-page **titles**; project title editable in the top bar (default "Untitled brief").

## 4. Pages & projects

- Multi-page projects: reorder (move up/down), duplicate (gets " copy" suffix and fresh
  ids), delete (two-step "Delete?" confirm that auto-reverts after 3 s), **Clear marks**
  (removes all annotations, undoable).
- Overflow ("…") menu: New brief, Clear current brief, Settings.
- **Settings are real** (v1.1.0): capture shortcut (recorded in-dialog, conflict-checked),
  launch at login, menu-bar mode, default export folder, region-crop padding (0–64 px,
  default 16), include region crops in ZIP, copy ZIP path to clipboard. Stored in an atomic
  `settings.json` owned by the main-process `SettingsStore` (the single source of truth);
  the renderer reads/patches it over validated IPC.
- **Focus mode** button hides the side panels (pure CSS `data-focus` toggle).
- **Project Library**: card per saved brief with thumbnail (JPEG, 640px max, quality 0.8,
  from page 1), page/region counts, relative last-edited date, "Current" badge, search,
  open, duplicate, delete (confirmation modal). Sorted newest-first.
- Active page and active project are restored on relaunch (`app-state.json`).

## 5. Persistence (local-first, heavily defended)

All disk access goes through a single `ProjectRepository` in the main process with a
serialized write queue.

- **Autosave**: debounced **800 ms**, plus forced flush before switching projects, opening
  the library, exporting, and window close (main defers close until the renderer confirms,
  2 s failsafe). ⌘S forces a flush (there is no manual save-file concept).
- **Atomic writes**: temp file → fsync → previous copy to `.bak` → rename; reads fall back
  to `.bak` when the primary is corrupt.
- **Revisions**: saves carry an expected revision; a stale save is rejected and the
  renderer re-syncs and retries once — a delayed autosave can never overwrite newer state.
- **Tombstones**: deleted project ids are recorded in `tombstones.json` *before* file
  removal; any save for a tombstoned id is rejected, in-session and across restarts.
- **Ghost-draft suppression**: an untouched empty "Untitled brief" is never written, so no
  ghost library cards.
- **Corrupt-file quarantine**: bad project files are copied (never deleted) to `corrupt/`,
  restored from `.bak` when possible, reported via an in-app banner; one bad record never
  affects other projects.
- **Media GC**: on project deletion, media files referenced only by that project are
  removed.
- Save-status indicator in the top bar, four distinct states: "Edited" (changes waiting
  for the debounce), "Saving…" (write in flight), "Saved locally", "Save failed — Retry".

## 6. Exports

`shared/exportModel.ts` is the single source of truth: an export may contain **only** the
title, page renders, per-page overall messages, and numbered region instructions — nothing
else, ever (unit-tested against metadata leakage). All user text is HTML-escaped. Non-region
shapes (arrows, pen, boxes, circles) are baked into the page image but have no text entries.
Page renders come from one offscreen Konva renderer (max dimension 2400, JPEG q0.88,
pixel-ratio cap 2) — export matches exactly what you annotated.

Five actions in the Export menu (⌘E; disabled with a note when there are no pages):

0. **AI Brief ZIP** (v1.1.0) — a self-contained package for AI agents with its **own
   independent contract** (`shared/aiBrief.ts`; the existing `exportModel.ts` contract is
   untouched). Structure: `smart-brief-<slug>/` containing `README.md`, `manifest.json`
   (schema "1.0"), `brief.md`, `project-preview.jpg`, and per page
   `pages/page-NNN/original.<ext>` (untouched source bytes at native resolution; blank
   compositions render at 1:1), `annotated.png` (full-resolution render with markers, no
   UI handles) and `regions/region-NNN.png` (crops cut from the ORIGINAL pixels with the
   configured padding, clamped to image bounds — never affected by viewport zoom). Bounds
   appear in source pixels and normalized 0–1; region numbers match across image, MD,
   JSON and filenames. The manifest is verified against the actual package on every export
   (no missing entries, no orphans). Packages over 100 MB are refused with options (e.g.
   "export without region crops") — original quality is never reduced silently. Written by
   the main process via temp file + atomic rename. Optional: ZIP path copied to the
   clipboard after export (setting).

1. **Copy image to clipboard** — renders the brief image and copies it without writing a
   file.
2. **HTML brief** — fully self-contained offline document, images inlined as base64 (max
   dimension 2000), inline CSS, no scripts.
3. **Continuous JPG** — one 1400px-wide sheet (48px margins, quality 0.85); auto-splits
   into numbered `-part2`, `-part3`… files when a part would exceed **14,000 px** tall.
   The first sheet is also auto-copied to the clipboard (even if the save dialog is
   cancelled).
4. **PDF brief** — the export HTML printed through a hidden BrowserWindow via `printToPDF`
   (A4, 0.4in margins, backgrounds on).

Export filenames are sanitized (illegal chars stripped, 80-char cap, fallback "brief").

## 7. Keyboard & menu

| Shortcut | Action |
| --- | --- |
| ⌘V | Paste image (new page, or placed image on a blank page) |
| ⌘Z / ⇧⌘Z | Undo / redo (text or canvas, by focus) |
| ⌘S | Force-save (flush autosave) |
| ⌘O | Import screenshots |
| ⌘N | New brief |
| ⌘E | Export menu |
| ⌘+ / ⌘− / ⌘0 | Whole-interface zoom in/out/reset (plain ⌘= also zooms in); Electron zoom levels, factor 1.2^level, clamped −3..3, persisted to `ui-state.json` |
| ⌥B (global, configurable) | Quick Capture from anywhere on the Mac |
| Space (hold) + drag | Pan canvas |
| Pinch / ⌘-scroll | Canvas zoom at cursor |
| Delete / Backspace | Remove selected object |
| Esc | Cancel / close / deselect cascade |

Native macOS menu wires ⌘N/⌘O/⌘S/⌘E and routes undo/redo to the renderer. DevTools/Reload
menu items appear only in dev (`SMART_BRIEF_DEV_URL` set).

## 8. Security

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; minimal typed
  preload API (`window.smartBrief`).
- Every IPC handler validates inputs: type checks, filename regex `^[a-zA-Z0-9._-]+$` with
  path-traversal rejection, size caps (200 MB media, 100 MB export payloads, 5 MB
  thumbnails).
- Strict CSP (`script-src 'self'`; images only self/blob/data). Window-open, navigation,
  and all permission requests denied.
- Media bytes are loaded over IPC into same-origin blob URLs so canvases never taint
  (exports depend on `toDataURL`). Exported HTML never includes scripts.

## 9. Window & chrome

1440×900 default, min 880×600, `hiddenInset` title bar, traffic lights at {14,13},
background `#f4f2ee`, custom icon, Retina-correct rendering.

## 10. Testing & tooling

- **75 unit tests** (Vitest): capture geometry (Retina/clamping/negative origins), AI
  Brief contract (manifest/brief.md/README, metadata filtering, naming), settings
  validation, plus the original suites: region numbering, geometry inverses/zoom-at-cursor,
  schema migration & normalization, repository (stale-revision rejection, tombstones
  across restarts, quarantine, `.bak` recovery, media GC, serialized writes), export-model
  content policy + escaping.
- **11 e2e tests** (Playwright driving the real built Electron app): basic brief +
  restart-persistence, multi-project isolation, deletion regression (pending-autosave
  race), ghost draft, exports (HTML/JPG/PDF content checks), blank composition,
  visual QA at three window sizes, UI-zoom shortcuts, and three Quick Capture suites
  (full capture→annotate→ZIP→restart flow with unzip verification; empty-capture
  discard leaves nothing; deleted capture cannot be resurrected by a stale autosave).
- Test/scripting hooks: `SMART_BRIEF_DATA_DIR` (isolated data dir),
  `SMART_BRIEF_EXPORT_DIR` (bypass save dialogs), read-only `window.__sbTest.getProject()`.
- `scripts/verify-packaged.mjs` launches the actual packaged `.app` and verifies
  persistence across a restart.
- Scripts: `dev` (Vite + Electron), `build`, `start`, `lint`, `test:unit`, `test:e2e`,
  `package` (electron-builder, arm64 .app + DMG), `make-icon`, `smoke`.

## 11. Data model (for upgrade planning)

`Project → Page[] → { sourceImage?, placedImages[], annotations[], overallMessage }` with
`schemaVersion` (currently v1, with v0→v1 migration), `revision`, timestamps, per-page
zoom/pan, and page kind `screenshot | blank`. Annotations:
`region | arrow | pen | rectangle | ellipse`; regions carry `number` + `instruction`.
`migrateProject` defensively normalizes — malformed annotations are dropped, valid work
kept; payloads from a *newer* schema version are rejected. Region numbers are recomputed
from array order on every mutation and undo/redo.

## 12. Quick Capture (v1.1.0)

- **Global shortcut** (default ⌥B, configurable, validated as modifier+key) registered via
  Electron `globalShortcut`; registration failures are surfaced in-app (banner + Settings
  error), never silent; unregistered on quit. Also triggerable from the File menu, the
  tray menu, the empty state, and `window.smartBrief.startCapture()`.
- **Selection overlay**: frameless always-on-top windows on **every display at once**, each
  showing that display's frozen `desktopCapturer` frame — drag on whichever screen you want.
  Gentle dim, crosshair, live device-pixel dimensions readout. Esc on any overlay cancels
  all; focus leaving the capture entirely (app switch) cancels cleanly, while focus moving
  between overlays does not. Limitation: a single selection cannot span two displays.
- **The grab itself uses macOS `screencapture -x -R`**, not the overlay's frozen frame:
  `desktopCapturer` only yields a scaled-down window-server preview (that was the cause of
  soft, ~half-resolution captures before 1.1.0). Overlays call
  `setContentProtection(true)`, which excludes them from screen capture, so the region is
  grabbed **while the overlay stays on screen** — no hiding, no flicker, no teardown delay,
  and the dim layer can never end up in the shot (verified empirically). The region is
  written at native framebuffer resolution (a 400×200-point selection → 800×400 px on a
  2× display; verified).
  `shared/captureGeometry.ts` maps the window-local selection to the global point rectangle,
  adding the display origin (this is what makes displays left of / above the primary work)
  and applying no scale factor, since the tool takes points and emits pixels. Unit-tested
  for negative origins, negative-size drags and rounding.
- **Annotate in place — the app window never comes forward.** After the drag the same
  overlay becomes the editing surface: the capture is shown with a hairline frame and a
  shadow over a strongly dimmed backdrop, so it always reads as a captured image you are
  marking up rather than as your live desktop. A selection that fits comfortably stays
  exactly where it was taken, at 1:1; a selection too large for that (a whole screen, most
  obviously) is scaled down and centred so there is always a visible margin and room for
  the toolbar (`captureDisplayRect`, unit-tested). The floating toolbar measures itself and
  centres under the capture, flipping above it when there is no room below. The overlay hosts the **real editor** — the same `projectStore`,
  `CanvasWorkspace`, tools, palette, undo/redo and autosave — so nothing about regions or
  drawing is reimplemented.
- **Floating per-region instruction composer**: opens focused on region creation;
  auto-flips right→left→below/above so it never covers the region; draggable; multiline
  autogrow; prev/next region; delete; ⌘↩ done; Esc collapses without losing anything;
  clicking a region reopens it with its text; hovering shows a compact preview. A
  separate floating composer holds the one overall message ("Note" in the toolbar).
- **Done** (button or ⌘↩) hands the finished project to the Smart Brief window, which
  opens it in the normal editor ready to export. That is the only moment the app window
  is brought forward.
- **Persistence rules**: the overlay creates the page through the official
  store/repository path (same revisions, tombstones, media GC, autosave), so work is
  crash-safe while annotating. Cancelling before a selection creates nothing; discarding
  after one flushes and then deletes through the repository, leaving no ghost project,
  orphan screenshot or empty thumbnail (e2e-tested, including stale-autosave
  resurrection). Discarding asks for confirmation once anything has been marked.
- **Esc cascade in the overlay** (in order): in-progress drawing (canvas cancels it) →
  open overall composer → region composer collapse → clear selection → discard (with
  confirmation when work exists). In the main window: export menu → settings → permission
  help → library → in-progress drawing → focused text field blur → clear selection.
- **Menu-bar mode** (default on): tray item (code-drawn template icon) with Open Smart
  Brief / Quick Capture (+shortcut) / Library / Quit; `window-all-closed` keeps the app
  alive so the shortcut still works; disable in Settings to restore quit-on-close.
- **Screen Recording permission**: status via `systemPreferences.getMediaAccessStatus`;
  when missing, a capture attempt registers the app in the macOS list, and an in-app
  explainer offers "Open System Settings" (deep link to Privacy → Screen Recording),
  notes the possible restart, and rechecks on window focus. No other permissions are
  requested (all renderer permission requests remain denied).
- **Test hooks**: `SMART_BRIEF_FAKE_CAPTURE=1` (deterministic synthetic 960×600 capture,
  no permission needed), `SMART_BRIEF_DISABLE_GLOBAL_SHORTCUT=1` (tests never grab real
  global shortcuts).

## Known soft spots / notes for the next upgrade

- No custom colors, no text/label annotation tool, no crop, no image editing beyond
  place/move/resize/layer on blank pages.
- No max page count or pixel-dimension cap on imports (only the 200 MB byte cap).
- Default build is unsigned; free self-signed (`package:dev-signed`) and Developer ID
  (`package:signed`, needs an Apple account) configs exist. arm64 only.
- Dark mode follows the system appearance (no in-app theme override toggle yet).
- Focus mode is CSS-only panel hiding.
- A single Quick Capture selection cannot span two displays (overlays cover all displays,
  but each drag is bounded to the screen it started on).
- The overlay's drag UI is covered by unit tests of its math + manual testing; the OS
  screen grab itself requires Screen Recording permission and a human (see TESTING.md
  manual checklist).
