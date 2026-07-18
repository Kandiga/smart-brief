# Smart Brief — Testing

## Commands

```bash
npm run test:unit    # Vitest (75 tests)
npm run test:e2e     # Playwright driving the real built Electron app (11 tests)
npm run lint         # ESLint (typescript-eslint recommended, zero warnings)
npm run typecheck    # tsc --noEmit, strict
```

`test:e2e` requires a prior `npm run build` (it launches `electron .` against `dist/`). Every
e2e test runs in its own throwaway data directory via the `SMART_BRIEF_DATA_DIR` env override,
and export tests bypass native save dialogs via `SMART_BRIEF_EXPORT_DIR`. Two more hooks exist
for Quick Capture: `SMART_BRIEF_DISABLE_GLOBAL_SHORTCUT=1` (always set by the e2e helpers so
tests never grab real global shortcuts) and `SMART_BRIEF_FAKE_CAPTURE=1`, which swaps only
the OS screen grab for a deterministic synthetic image while keeping the **real overlay
flow** — so the tests drive the actual in-place capture UI (select, annotate, Done) via
Playwright's second-window handle, without needing Screen Recording permission.

## Unit tests (`tests/unit/`)

- `numbering.test.ts` — sequential region numbering, renumbering after deletion, instruction
  preservation, non-region annotations untouched.
- `geometry.test.ts` — screen↔page transforms are exact inverses at multiple zoom levels,
  zoom-at-cursor keeps the anchor stationary, fit-to-view contains and centers, point thinning.
- `schema.test.ts` — JSON round-trip, v0→v1 migration, malformed-annotation dropping, stale
  `activePageId` fallback, newer-schema rejection, empty-draft detection.
- `repository.test.ts` — save/reload, **stale-revision rejection**, **permanent deletion with
  tombstones** (including across repository restarts), duplicate-with-new-ids, sorted listing,
  corrupt-file quarantine without collateral damage, `.bak` recovery, media garbage collection,
  serialized concurrent writes.
- `exportModel.test.ts` — export model contains only visual content (asserts absence of
  "brief direction", "goal", "target model", "must preserve", "must avoid"), HTML escaping.
- `captureLayout.test.ts` — how the capture is presented while annotating: a comfortable
  selection stays 1:1 in place, a full-screen selection is scaled down and centred with a
  visible margin and room for the toolbar, aspect ratio preserved, degenerate inputs safe.
- `captureGeometry.test.ts` — overlay selection → global `screencapture -R` region
  (display origins including displays left of / above the primary, negative-size drags,
  rounding, and the invariant that no scale factor is pre-applied), region crop bounds with
  padding, normalized bounds.
- `aiBrief.test.ts` — AI Brief ZIP contract: model building (numbers, source dims, package
  paths), manifest metadata filtering (no ids/revisions/local paths), brief.md/README
  generation, package root-name sanitization (path traversal, unicode, length),
  expected-file listing.
- `settings.test.ts` — shortcut accelerator validation (rejects bare keys/malformed),
  settings normalization (defaults, clamping, unknown-key stripping), macOS display form.

## End-to-end tests (`tests/e2e/`)

1. **basic-brief** — import screenshot (drag & drop), draw numbered region, type instruction,
   add arrow, overall message; restart app; everything restored.
2. **multi-project** — two projects with distinct content, switching via the library shows no
   mixing; both restored after restart.
3. **deletion** (regression) — Project B deleted while an autosave may be pending: absent from
   the reopened library, absent after restart, not recreated after waiting past the debounce
   (verified against the on-disk `projects/` directory).
4. **ghost draft** — untouched "Untitled brief" never produces a library card or a file on disk,
   before or after restart.
5. **exports** — two-page annotated brief exported to HTML/JPG/PDF; files exist with non-zero
   size; HTML opened in a plain browser shows both page images; forbidden metadata terms absent.
6. **blank-composition** — blank canvas with two dropped images, moved and resized via the Edit
   tool (transformer handle drag), plus region + arrow; fully restored after restart.
7. **visual-qa** — window driven to 1440×900, 1728×1117 and 900×700; asserts no horizontal
   overflow and captures the screenshots in `screenshots/`.
8. **quick-capture / TEST 8** — drives the **real overlay window**: select a region, verify
   the floating toolbar appears in place (the app window is not pulled forward), mark a
   region via the floating composer, Esc-collapse preserves the text, add an overall
   message, press Done, and assert the main window receives the project with the capture at
   native pixel scale. Then AI Brief ZIP is exported and **unzipped in the test**:
   structure, manifest ⇄ file cross-check, instructions, forbidden metadata absent, original
   byte-identical to the stored capture; save indicator shows Edited → Saved locally;
   everything restored after restart.
9. **quick-capture / TEST 9** — discarding a marked-up capture: walks the overlay Esc
   cascade (composer → selection → confirmation), confirms Discard, then asserts no project
   file, no orphan media and no library card — before or after restart.
10. **quick-capture / TEST 10** — deletion regression for capture-created projects: capture,
    Done, delete with a possibly-pending autosave; the tombstoned project never resurrects.

The renderer exposes a read-only `window.__sbTest.getProject()` hook so tests assert real
persisted state instead of scraping canvas pixels.

## Packaged-build verification

`node scripts/verify-packaged.mjs` launches the actual
`release/mac-arm64/Smart Brief.app` binary, creates a brief, restarts the packaged app,
verifies persistence (prints `PACKAGED PERSISTENCE OK`), then relaunches with the fake-capture
hook and verifies Quick Capture works inside the packaged build (`PACKAGED QUICK CAPTURE OK`).

## Manual checklist (needs a human + Screen Recording permission)

The OS-level screen grab and the fullscreen overlay cannot be driven by automation, so verify
once per release on real hardware:

- ⌥B works while another app is focused (menu-bar mode on, window closed).
- Overlay: dimming, crosshair, live dimensions, Esc cancel; drag a small area and the full
  screen; Retina display → exported original matches native pixel resolution (a selection of
  N×M points must produce a 2N×2M pixel image on a 2× display, and text must be crisp).
- The dim layer / marquee must NOT appear in the saved capture (content protection).
- After the drag you stay on your own screen: toolbar floats beside the selection, the app
  window does not come forward until Done is pressed.
- External display: overlays appear on ALL displays simultaneously, each at its own native
  resolution; a drag is bounded to the screen it started on (documented limitation); Esc on
  either display cancels both; clicking between overlays does not cancel.
- Dark mode: switch system appearance — editor, capture mode and dialogs follow without
  restart; window background matches on relaunch.
- First run without permission: explainer appears, "Open System Settings" lands on
  Privacy & Security → Screen Recording; recheck after granting (may need app restart).
- Register a conflicting shortcut in Settings → clear inline error, old shortcut kept.
