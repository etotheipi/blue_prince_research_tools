# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A static, browser-based fan toolkit for the puzzle game **Blue Prince**. No build step, no bundler, no server-side code. Everything runs as plain HTML/CSS/JS served from the filesystem or a simple HTTP server.

## Running locally

The app must be served over HTTP (not opened as a `file://` URL — browser security blocks `fetch()` calls):

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

No install step needed.

## Architecture

The entry point is [index.html](index.html), which defines a sidebar nav and six tab panes. Routing is hash-based (`#tools`, `#anagram`, `#docs`, `#browser`, `#quickref`, `#layout`). Tabs are lazy-initialized on first visit.

**Tab modules** — each tab's logic lives in a separate JS file or sub-app:

| Tab | Implementation |
|-----|---------------|
| Calculators (`#tools`) | [js/tab-tools.js](js/tab-tools.js) — `initToolsTab(container)` |
| Anagram Solver (`#anagram`) | [anagram/index.html](anagram/index.html) loaded in an `<iframe>`; heavy lifting in [anagram/worker.js](anagram/worker.js) (Web Worker) |
| All Documents (`#docs`) | [js/tab-docs.js](js/tab-docs.js) — `initDocsTab()` fetches and renders [content/master_ref.md](content/master_ref.md) via `marked.js` |
| Doc Browser / Quick Reference | Placeholder panes, not yet implemented |
| Layout Organizer (`#layout`) | [layout-organizer/index.html](layout-organizer/index.html) loaded in an `<iframe>` |

**Shell router** — [js/app.js](js/app.js) handles hash routing and lazy-init. Tab modules must be loaded before `app.js` (see `<script>` order in `index.html`).

**Data files** (loaded at runtime via `fetch()`):
- [data/elements.json](data/elements.json) — periodic table for the Periodic Table Lookup calculator
- [data/wordlist.json](data/wordlist.json) — full word list for the anagram solver
- [data/priority_words.json](data/priority_words.json) — user-highlighted priority words for anagram solver
- [content/master_ref.md](content/master_ref.md) — master reference document (lore, puzzles, tables) rendered in the Docs tab

## Key mechanics

**Numeric Core calculator** (`tab-tools.js`): Given 4 numbers, finds the minimum non-negative whole-number result achievable using one each of `−`, `×`, `÷` applied left-to-right as `((a op b) op c) op d`. All 6 permutations of the 3 operators are tried. Accepts various input formats: comma-separated, 4-digit string, 5-digit string (tries all two-digit splits), or 4 letters (A=1…Z=26).

**Anagram solver** (`anagram/`): Web Worker (`worker.js`) does the search so the UI stays responsive. Supports multi-word anagrams with a priority word list and a 3-second timeout on complete-solution search.

## Styling

All shared styles are in [css/main.css](css/main.css). The anagram sub-app has self-contained `<style>` in its HTML file. The layout organizer is a separate sub-project with its own styles.
