# BarSuffer

An **unofficial** schedule planner for Bar-Ilan University students. Build your semester, see clashes,
gaps and workload at a glance, and get a (joking) **suffering index** for your week.

**Live site:** https://marritcreep.github.io/barsuffer/

> BarSuffer is a draft-planning tool. It is not affiliated with Bar-Ilan University, it never registers
> you for anything and it never asks for your Inbar password. Registration happens only in Inbar —
> always double-check your schedule there.

## Features

**Planning**
- Search courses by name, number or lecturer.
- Sun–Fri week grid (08:00–22:00) for Semester A and B, yearly courses included.
- Pick groups straight on the grid: tap a course, its groups appear as dashed “ghosts”, tap one to pick it.
  Linked exercises switch their lecture automatically.
- Clashes highlighted on the grid and listed; tap an empty cell to see every course that meets at that hour.
- Personal blocked time (work, gym…) that counts as a clash.
- **Auto-pick**: mark the courses you can’t skip, and it finds the 5 least painful clash-free combinations.
  Adjustable “what hurts you most” weights.
- Undo / redo (Ctrl+Z / Ctrl+Y), hide a course without removing it, remove it with the × on the grid.

**Your week, in numbers**
- Suffering index with a breakdown and one of ten titles; each ghost shows how it would change the index.
- Weekly heat map of suffering per day and your “hell day”.
- Academic hours, credits, hours on the road for your commute.
- **Today** view: what’s on now and next, semester progress, steps for the day and a rain warning
  for long walks (forecast from Open-Meteo).
- Coffee in your gaps: the nearest café on the way and how many minutes are left for coffee.
- Step counter with silly comparisons — from a football pitch to the nucleus of comet 3I/ATLAS.
- **BarSuffer Wrapped**: story slides for Semester A, B or the whole year, with a 1080×1920 image to share.

**Campus (experimental)**
- Schematic campus map with your day’s route, gate to gate, and a “Run!” warning when two back-to-back
  classes are too far apart. Building positions and walking times are rough estimates.

**Your data stays with you**
- **Import from Inbar**: export your schedule from Inbar as a PDF and upload it. The PDF is read in your
  browser and never sent anywhere; your name in it is ignored. Courses that aren’t in BarSuffer’s data yet
  are listed as errors, everything else is added.
- Saved automatically in your browser. **Save file / Open file** moves your schedule and settings
  between devices — no account needed.
- No server, no accounts, no ads, no analytics. Dark and light themes, works on phones.

## Data

The course data is currently a **hand-collected sample** (`src/data/sample-2027.json`, 2026–27): real
courses from one student’s schedule plus invented groups marked **DEMO** to exercise the planner. Credits are
placeholders. The official catalog is protected against automated access, so BarSuffer does not scrape it;
a full catalog will be added only from a source the university permits.

## Running locally

Requires Node.js 22+.

```
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173).

## Tests

```
npm test             # unit tests for the logic (Vitest)
npx playwright test  # the site in a real browser, desktop and phone (uses installed Microsoft Edge)
npm run build        # type check and production build
```

Every push to `main` runs the unit tests and the build and publishes the site to GitHub Pages.

## Tech

React 19, TypeScript, Vite, Vitest, Playwright. A static site: all logic (clashes, the index, auto-pick,
the PDF import) runs in the browser. PDF reading uses [pdf.js](https://mozilla.github.io/pdf.js/), weather
comes from [Open-Meteo](https://open-meteo.com/) (only the campus coordinates are sent).

## Contributing

Ideas and bug reports are welcome in Issues. Please don’t add scrapers for university systems or any
feature that asks for Inbar credentials — see the rules in `CLAUDE.md`.
