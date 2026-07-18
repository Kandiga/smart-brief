# Smart Brief

**Point at what you want changed, say it in plain words, and hand an AI agent a package it
actually understands.**

Smart Brief is a local-first macOS app for turning what's on your screen into a clear visual
brief. Press one shortcut, drag a box around the thing that bothers you, mark the areas that
need to change, write a sentence for each one, and export. No accounts, no cloud, no forms —
everything stays on your Mac.

---

## Why it exists

Describing a visual change in words is painful. *"The button under the second card, the one
on the right, not that one — move it up a bit and make it green."* You know exactly what you
mean, but writing it down takes longer than the change itself, and half of it gets lost
anyway.

Pointing is faster than describing. Smart Brief lets you point: draw a numbered box on the
screenshot, type one line next to it, done. What comes out is unambiguous for a human
reviewer — and, more importantly, structured enough for an AI coding agent to act on
without guessing.

## What makes it different

Most annotation tools give you a picture with arrows on it. An AI agent receiving that picture
has to infer what the arrows mean, where exactly they point, and which instruction belongs to
which spot.

Smart Brief exports an **AI Brief ZIP** instead — a self-contained package that spells it out:

```
smart-brief-your-project/
├── README.md                    ← explains the package to whoever opens it
├── brief.md                     ← every instruction in reading order
├── manifest.json                ← the same thing as structured data (schema 1.0)
├── project-preview.jpg
└── pages/page-001/
    ├── original.png             ← the untouched screenshot, native resolution
    ├── annotated.png            ← the same shot with numbered markers
    └── regions/
        ├── region-001.png       ← a close-up crop of just that area
        └── region-002.png
```

Region numbers match across the annotated image, the Markdown, the JSON and the crop
filenames. Coordinates are given both in source pixels and normalised 0–1. An agent can read
`brief.md` and go, or parse `manifest.json` and be precise about it.

The package contains the brief and nothing else — no internal ids, no file paths from your
machine, no metadata. That's enforced by an explicit contract in the code and covered by
tests.

## Quick Capture — the fast path

Press **⌥B** from anywhere on your Mac (the app can sit quietly in the menu bar):

1. The screen freezes under a gentle dim. Drag a box around the area you care about.
2. **You stay right where you are.** The capture appears framed against a dimmed backdrop —
   exactly where you took it if it fits, neatly centred if it was a whole screen — with a
   small toolbar floating under it.
3. Draw a numbered **Region**; a composer opens next to it, already focused. Type the
   instruction. `⌘↩` when you're done with it, `Esc` to tuck it away — nothing is ever lost,
   and clicking a region reopens its text. Arrows, boxes, circles, freehand, eight colours,
   undo/redo.
4. Press **Done**. Only now does the brief land in Smart Brief, ready to export.

Captures are taken at your display's true resolution — a Retina screen gives you a Retina
screenshot, not a blurry preview of one.

## The rest of it

- **Multi-page briefs** from screenshots (drag & drop, `⌘V`, `⌘O`) or blank 1500×900 canvases
  you compose images onto.
- **Numbered regions with linked instructions**, plus arrows, freehand pen, boxes, circles,
  8 colours, 4 stroke widths, deep zoom (up to 40×), per-page undo/redo.
- **Project library** with thumbnails, search, duplicate and delete.
- **Other export formats**: self-contained offline HTML, one continuous JPG (auto-split when
  very tall), a clean PDF, or straight to the clipboard.
- **Local-first storage that takes losing your work seriously**: debounced autosave, atomic
  writes with `.bak` recovery, revision checks so a late autosave can't overwrite newer
  state, tombstoned deletes that survive restarts, corrupt-file quarantine, and garbage
  collection of unreferenced images.
- **Privacy by construction**: sandboxed renderer, context isolation, strict CSP, validated
  IPC, no network calls. Nothing leaves the machine unless you export it and share it
  yourself.

## Platform support

**macOS (Apple Silicon) today.** Quick Capture leans on macOS APIs — `screencapture` for
pixel-exact grabs and window content protection so the overlay never photographs itself — so
that part is genuinely macOS-specific.

The rest of the app (Electron + React + Konva) is portable, and the capture layer is isolated
behind a small interface, so **Windows and Linux builds are possible later**. No promises on
timing; contributions welcome if you want one sooner.

## Install

Download the DMG from [Releases](../../releases), or build it yourself:

```bash
npm install
npm run package        # → release/mac-arm64/Smart Brief.app + a DMG
```

The build is unsigned, so on first launch right-click the app → **Open** to get past
Gatekeeper. macOS will ask for **Screen Recording** permission the first time you use Quick
Capture (System Settings → Privacy & Security); the app explains this and links you there.

If you rebuild often, a free self-signed certificate gives the app a stable identity so the
permission sticks — see the build notes below. You do **not** need a paid Apple Developer
account to use this on your own machine.

## Development

```bash
npm install
npm run dev          # Vite dev server + Electron
npm run build        # typecheck + renderer + main/preload bundles
npm start            # run the production build
npm run lint         # eslint, zero warnings
npm run test:unit    # vitest
npm run test:e2e     # playwright, drives the real Electron app
npm run package      # unsigned .app + DMG (arm64)
```

Three packaging configs are included: unsigned (default), free self-signed
(`npm run package:dev-signed`, for your own machine), and Developer ID + notarisation
(`npm run package:signed`, only needed to distribute to other people).

`ARCHITECTURE.md` covers the design, `FEATURES.md` is a full inventory of behaviour, and
`TESTING.md` describes the test strategy — 75 unit tests and 11 end-to-end tests that drive
the real app, including regressions for the persistence and export guarantees above.

## Keyboard

| Shortcut | Action |
| --- | --- |
| `⌥B` | Quick Capture from anywhere (global, configurable in Settings) |
| `⌘V` | Paste an image |
| `⌘Z` / `⇧⌘Z` | Undo / redo |
| `⌘S` | Force-save |
| `⌘O` | Import screenshots |
| `⌘N` | New brief |
| `⌘E` | Export menu |
| `⌘+` / `⌘−` / `⌘0` | Zoom the interface in / out / reset |
| `Space` + drag | Pan the canvas |
| Pinch or `⌘`+scroll | Zoom at the cursor |
| `Esc` | Step back: close, collapse, deselect, cancel |

## License

MIT — see [LICENSE](LICENSE).
