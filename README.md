# Blue Prince — Community Tools

A static, browser-based toolkit for the puzzle game [Blue Prince](https://store.steampowered.com/app/1569580/Blue_Prince/). Hosted as a GitHub Pages site — if you're reading this on the repo, the live site is the better place to actually use these tools.

- https://etotheipi.github.io/blue_prince_research_tools

## Tools

### Calculators
Several small utilities for in-game puzzles:

- **Numeric Core** - Accepts digits, comma-separated values, or 4-letter words (A=1…Z=26). Supports bulk input.
- **Periodic Table Lookup** — Convert between letter & number encodings and elements in the periodic table
- **Day of Week** — Input:  Abs date or relative day number.  Gives absolute date, day of week, and day number
- **Number ↔ Letters** — Basic A=1…Z=26 conversion in both directions.

### Anagram Solver
Interactive, multi-word anagram solver backed by a full English wordlist, and an extra priority wordlist, particularly useful for adding names or Erajan terms to the search.  Can add words to the result and see what letters and words remain in the pool.

### All Documents
Renders the community master reference document — a single searchable page covering nearly every document in the game, with some additional reference material at the top (lists of realms, angels, blessings, items, etc). Includes in-page search with highlight and prev/next navigation.

### Layout Organizer
Drag-and-drop tool for mapping out room layouts. Place, rotate, and arrange any of the 110 room tiles on a 9×5 grid. Includes room details, lore, and mechanics sourced from the community wiki. Save/load layouts as JSON and export to PNG.

## Running locally

No build step. Requires Python 3 (or any HTTP server — the app uses `fetch()` and won't work as a bare `file://` URL):

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Structure

```
index.html                  # Main shell — sidebar nav + tab panes
css/main.css                # All shared styles
js/app.js                   # Hash-based router, tab lazy-init, sidebar toggle
js/tab-tools.js             # Calculators tab
js/tab-docs.js              # All Documents tab (fetches + renders master_ref.md)
content/master_ref.md       # Community master reference document
data/elements.json          # Periodic table data
data/wordlist.json          # Anagram solver wordlist
anagram/                    # Anagram solver (self-contained, loaded in iframe)
layout-organizer/           # Layout drag-and-drop tool (self-contained, loaded in iframe)
```

## Notes

- All game content belongs to its respective owners. This is an unofficial fan project.
