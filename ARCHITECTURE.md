# Smart Brief — Architecture

Electron + React 18 + TypeScript + Vite, with react-konva for the canvas and Zustand for state.
Everything is bundled at build time (esbuild for main/preload, Vite for the renderer), so the
packaged app carries no `node_modules`.

```
src/
  main/                 Electron main process
    main.ts             window, lifecycle, flush-before-close, security handlers,
                        settings side effects (shortcut/tray/login item)
    ipc.ts              validated IPC handlers (typed channel contract)
    menu.ts             native menu (⌘N/⌘O/⌘S/⌘E; undo/redo routed to renderer)
    exporters.ts        save dialogs, JPEG part writing, hidden-window printToPDF,
                        atomic ZIP writes (temp file → rename)
    capture.ts          Quick Capture controller: global shortcut, permission check,
                        frozen desktopCapturer frame, overlay window, native-res crop
    settings.ts         SettingsStore — SSOT for settings.json (atomic, validated)
    tray.ts             optional menu-bar item (code-drawn template icon)
    persistence/
      atomicFile.ts     tmp-write → fsync → .bak → rename; backup-aware reads
      repository.ts     serialized write queue, revisions, tombstones, media GC
  preload/preload.ts    contextBridge: minimal typed `window.smartBrief` API
  renderer/
    capture.html        second Vite entry: the in-place capture overlay
    src/
      App.tsx           shell: keyboard/Esc cascade, paste, drop, menu IPC, flush,
                        capture hand-off, permission explainer
      capture/          CaptureOverlayApp (select → annotate in place, Done),
                        SelectionLayer (marquee), overlay.css
      components/       TopBar, VisualToolbar, PageEditor, CanvasWorkspace,
                        InstructionPanel, ProjectLibrary, ExportMenu, EmptyState,
                        FloatingComposer, SettingsDialog
      canvas/           offscreen Konva page renderer (exports + thumbnails),
                        media image hook
      stores/           projectStore (project + history + autosave), uiStore
      services/         media loading/import, capture completion/exit flows,
                        export builders (html/jpg/pdf/aiBriefZip)
  shared/
    schemas/project.ts  versioned data model, migration, normalization
    contracts/ipc.ts    channel names + payload types shared by all processes
    geometry.ts         pure viewport/coordinate math (unit-tested)
    captureGeometry.ts  overlay-DIP → image-pixel math, crop/normalized bounds
    exportModel.ts      the single source of truth for HTML/JPG/PDF export content
    aiBrief.ts          the independent AI Brief ZIP contract (manifest/brief/README)
    settings.ts         settings shape, defaults, validation, shortcut rules
```

## Data model

`Project → Page[] → { sourceImage?, placedImages[], annotations[], overallMessage }` with
`schemaVersion`, `revision`, timestamps and per-page zoom/pan state. Annotations are
`region | arrow | pen | rectangle | ellipse`; regions carry `number` + `instruction`. Region
numbers are always derived from array order via `renumberRegions`, so deletion renumbers
automatically. `migrateProject` upgrades old payloads and defensively normalizes (malformed
annotations are dropped, valid work is kept).

## Persistence (the part that had a deletion bug in an earlier life)

All disk access goes through one `ProjectRepository` in the main process with a serialized
promise queue. The rules:

- **Atomic writes**: temp file → `fsync` → copy previous to `.bak` → `rename`.
- **Revisions**: `saveProject(project, expectedRevision)` rejects when the stored revision
  differs — a stale, delayed autosave can never overwrite newer state.
- **Tombstones**: `deleteProject` records the id in `tombstones.json` *before* removing files.
  Any save for a tombstoned id is rejected (`reason: 'deleted'`), in this session and after
  restarts. Deleted ids are never reused (UUIDs).
- **Ghost drafts**: the renderer never saves an untouched empty "Untitled brief"
  (`isEmptyDraft` + never-saved check), so no ghost library cards appear.
- **Renderer discipline**: every scheduled autosave captures the project id it will save;
  deleting a project cancels its pending timer, tombstones the id renderer-side, awaits the
  in-flight save chain, deletes, then loads the newest remaining project (or a fresh in-memory
  draft) without snapshotting the deleted one. Saves are flushed before switching projects,
  opening the library, exporting, and window close (main defers `close` until the renderer
  confirms, with a 2s failsafe).
- **Recovery**: on startup, corrupt project files are copied to `corrupt/` (never deleted),
  restored from `.bak` when possible, and reported in-app. One bad record never touches the
  other projects.
- **Media**: imported images are stored once as files in `media/` (UUID names) and referenced
  from JSON; on project deletion, files referenced only by that project are garbage-collected.
  The renderer loads bytes over IPC into same-origin blob URLs so canvases never taint
  (exports depend on `toDataURL`).

## Canvas

One Konva `Stage` per page section, in a vertically scrolling document (canvases lazy-mount via
IntersectionObserver). Annotations live in page coordinates; the stage transform handles
zoom/pan, so geometry is exact at every zoom level and on Retina displays. All coordinate math
is in `shared/geometry.ts`. Undo/redo is a per-page snapshot history (cap 100) with text-input
coalescing (1.2 s window). Exports and library thumbnails reuse a single offscreen renderer
(`canvas/renderPage.ts`), so what you export is exactly what you annotated.

## Exports

`shared/exportModel.ts` defines what the HTML/JPG/PDF/clipboard exports may contain: title,
pages, page images, overall messages, numbered region instructions — nothing else, ever. HTML
embeds page renders as data URLs (self-contained, offline). PDF prints the same HTML through a
hidden BrowserWindow with `printToPDF`. The continuous JPG measures text/image blocks first and
splits into numbered parts when a part would exceed a safe canvas height (14,000 px). All user
text is HTML-escaped.

The **AI Brief ZIP** is a separate export path with its own explicit contract in
`shared/aiBrief.ts` (untouched `exportModel.ts`): original images at source resolution
(byte-identical for screenshot pages), full-res annotated renders, padded region crops cut from
original pixels, `brief.md`, `manifest.json` (schema "1.0", user-visible region numbers only —
no internal ids/paths/revisions), and a README for the receiving agent. The renderer builds the
package (fflate) and asserts manifest ⇄ contents equality before zipping; the main process
enforces the 100 MB payload cap and writes via temp file + atomic rename. Oversized packages
are refused with options rather than silently degraded.

## Quick Capture

`main/capture.ts` owns the single capture session: on the global shortcut (default ⌥B,
registered/unregistered with settings changes and quit), it freezes the display under the
cursor via `desktopCapturer` at native pixel resolution, shows a frameless always-on-top
overlay (`renderer/capture.html`, a second Vite entry) that displays the frozen frame and
collects a marquee selection in window-local DIP.

That frozen frame is **only the backdrop**. `desktopCapturer` thumbnails are a window-server
preview, not the framebuffer, so cropping them yields a soft, roughly half-resolution image
on Retina. The real grab runs macOS' `screencapture -x -R` over the selected region.
Overlays call `setContentProtection(true)`, which excludes them from screen capture, so the
grab happens **while the overlay is still on screen** — no hiding, no flicker, and the dim
layer can never appear in the shot. `shared/captureGeometry.ts` converts the window-local
selection to the global point rectangle that tool expects — adding the display origin, which
is what makes displays positioned left of or above the primary (negative origins) work — and
applies **no** scale factor, because `screencapture` takes points and writes native pixels
itself.

The overlay is then the **editing surface**, not just a picker: it renders the real editor
(`capture/CaptureOverlayApp.tsx` hosting `CanvasWorkspace`, `VisualToolbar` and
`FloatingComposer` against the same `projectStore`) with the captured page pinned at 1:1
over the spot it came from, so the user annotates in place and the app window is never
brought forward. The page is created through the normal store → repository path, so
revisions, tombstones, media GC and autosave all apply while annotating; discarding deletes
through the same official path. Pressing Done sends only the project id to the main window,
which loads it in the normal editor (`capture:openProject`, plus a pull-based
`takePendingCapture` so a window created at that moment cannot miss it). The PNG enters through
`repo.saveMediaBuffer` (the official media path) and the renderer turns it into a normal
project page via the project store, so persistence guarantees (revisions, tombstones,
ghost-draft rules, media GC) apply unchanged. Completion is push+pull (`takePendingCapture`)
so a freshly created window can't miss it. Capture edit mode reuses CanvasWorkspace/undo/
autosave with different chrome (floating toolbar + per-region floating composer). Screen
Recording permission is detected and explained in-app; `SMART_BRIEF_FAKE_CAPTURE` provides a
deterministic synthetic capture for tests. v1 constraint: selections don't span displays.

## Settings

`main/settings.ts` is the SSOT: validated atomic `settings.json`, change listeners drive the
global shortcut re-registration, tray existence and the login item. The renderer's Settings
dialog patches over IPC and re-syncs from the returned state; an unregisterable shortcut is
rolled back with an explanation rather than applied.

## Security

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, no remote module. The
preload exposes a minimal typed API; every IPC handler validates inputs (types, path-traversal
checks on filenames, size caps). Strict CSP in `index.html` (`script-src 'self'`; images only
from `self`/`blob:`/`data:`). Window opening and navigation are denied; permission requests are
rejected. Imported images are treated as opaque bytes; exported HTML never includes scripts.
