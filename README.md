# AMC Simulator

A timed AMC 10 practice simulator modeled on the real AMC online test
environment (the AoPS platform), as replicated by the open-source
[Tesseract](https://github.com/amctesseract/amctesseract.github.io) project.
Built for Pat's AMC 10 B prep: full 75-minute timed mocks with the minute
plan, a live solved-count with checkpoints, and miss-cause classification
on review.

## What's in it

- **Home screen** — pick an exam (2024 AMC 10B = Mock 1, 2024 AMC 10A =
  Mock 2), instructions, recent attempts, and resume-in-progress.
- **Test screen** — 75:00 countdown, one question at a time, A–E bubbles
  on the left (click again to unselect = blank), Prev/Next, question
  palette (answered / current / flagged), flag-for-review, keyboard
  shortcuts (A–E answer, ←/→ move, F flag), Submit with confirmation.
- **Minute plan strip** — live phase: 0–3 scan, 3–28 Pass 1, 28–58 Pass 2,
  58–68 Pass 3, 68–75 check only. The ✓-solved counter records how many
  you have solved at the 28- and 58-minute checkpoints (the fix for the
  AMC 10 A miscount: 14 solved, counted as 15).
- **Results** — score (6 correct / 1.5 blank / 0 wrong), correct/blank/
  wrong breakdown, answers-vs-correct table (skipped = —), and a
  per-problem review with your answer highlighted green if correct /
  red if wrong, plus the worked solution.
- **Miss classification** — every missed problem gets a cause label:
  knowledge / recognition / execution / time. The review screen totals
  misses by cause, so the next mock targets the real bottleneck.
- **Exam history** — attempts saved in the browser's localStorage only
  (nothing is uploaded). Reopen any attempt from the history page.
  An in-progress exam autosaves and can be resumed after a refresh.

## Problems

25 problems each for 2024 AMC 10A and 2024 AMC 10B, with answer keys.
Problems © Mathematical Association of America (MAA). Sourced from
LIVE by Po-Shen Loh's public past-contest pages
(`live.poshenloh.com/past-contests/amc10/2024A` and `/2024B`), which
Pat already uses; answer keys cross-checked against the AoPS Wiki
answer-key pages (both matched exactly). Diagrams are local SVG copies
of the figures from those pages. Re-fetch with:

```
python3 tools/fetch_problems.py
```

One quirk the script handles: the source's `amc10ProblemNumber` field is
unreliable (duplicates, skipped numbers). Problem order is the array
order — verified against the diagram filenames and the AoPS Wiki keys.

Math is rendered with [KaTeX](https://katex.org/) via CDN, so the site
needs internet for the KaTeX files (problems themselves are local JSON
and work offline once loaded, except the CDN render step).

## Run it locally

No build step, no server needed — but `fetch()` of the local JSON data
files requires serving over HTTP (opening `index.html` directly with
`file://` will fail to load the exams in most browsers). Any static
server works:

```
cd amc-simulator
python3 -m http.server 8000
# open http://localhost:8000/
```

## Publish on GitHub Pages (repo: TheCrabbypatty/amc-simulator)

1. Create the **public** repo `amc-simulator` under `TheCrabbypatty`
   (the GitHub connector cannot create repos — create it in the browser
   while signed in to GitHub).
2. Push this folder's contents to the repo's default branch:
   ```
   git init
   git add .
   git commit -m "AMC Simulator: timed AMC 10 practice (2024 10A/10B)"
   git branch -M main
   git remote add origin https://github.com/TheCrabbypatty/amc-simulator.git
   git push -u origin main
   ```
3. In the repo: **Settings → Pages → Build and deployment → Source:
   Deploy from a branch → Branch: main, folder: / (root) → Save.**
4. The live page will be at `https://thecrabbypatty.github.io/amc-simulator/`
   (may take a minute or two after the first push).

No secrets, no backend, no build step — the whole site is static files.

## Files

```
index.html            home + test + finished + review screens
history.html          exam history (localStorage)
css/style.css         all styling
js/app.js             timer, palette, scoring, review, history
data/amc10a-2024.json 2024 AMC 10A — 25 problems + answer key
data/amc10b-2024.json 2024 AMC 10B — 25 problems + answer key
assets/diagrams/      figure SVGs for the geometry problems
tools/fetch_problems.py  re-fetch problem data from the source pages
```

## Not affiliated

Practice tool only — not affiliated with MAA, AoPS, or LIVE by Po-Shen Loh.


## Last Updated

<!-- TIMESTAMP_START -->
_Last updated: 2026-11-08 10:52 UTC_
<!-- TIMESTAMP_END -->
