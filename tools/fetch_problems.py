#!/usr/bin/env python3
"""Fetch 2024 AMC 10A / 10B problem data from LIVE by Po-Shen Loh's public
past-contest pages (the pages Pat already uses) and write local JSON data
files for the AMC simulator, plus the diagram SVGs those pages reference.

Source: https://live.poshenloh.com/past-contests/amc10/2024A and /2024B
  (Next.js __NEXT_DATA__ -> pageProps.baseQuestions, 25 problems each,
   with question text, choices A-E, answer key, hints, solutions.)
Answer keys are cross-checked against the AoPS Wiki answer-key pages
(verified 2026-11-07 via browser fetch):
  2024 AMC 10B: BBEDBBADAACABBCADBCACABEE
  2024 AMC 10A: ABBBDDBABCDECDEDEDECCBDBC

Diagrams are <img src="/amc10/2024B/11.svg"> style references on the same
host; they are downloaded into assets/diagrams/ and the src is rewritten
to the local relative path so the site works offline on GitHub Pages.

No problem text is invented or paraphrased: every field comes from the
source page. Run from anywhere; output goes to ~/workspace/amc-simulator/.
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"}
BASE = "https://live.poshenloh.com"
OUT = Path.home() / "workspace" / "amc-simulator"
DATA = OUT / "data"
DIAG = OUT / "assets" / "diagrams"

EXPECTED_KEYS = {
    "2024B": "BBEDBBADAACABBCADBCACABEE",
    "2024A": "ABBBDDBABCDECDEDEDECCBDBC",
}
EXAMS = {
    "2024B": ("2024 AMC 10B", "https://live.poshenloh.com/past-contests/amc10/2024B"),
    "2024A": ("2024 AMC 10A", "https://live.poshenloh.com/past-contests/amc10/2024A"),
}


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    DIAG.mkdir(parents=True, exist_ok=True)
    failures = []
    for code, (label, url) in EXAMS.items():
        print(f"== {label} ({url})")
        html = fetch(url).decode("utf-8")
        m = re.search(
            r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
            html, re.S)
        if not m:
            failures.append(f"{code}: no __NEXT_DATA__")
            continue
        qs = json.loads(m.group(1))["props"]["pageProps"]["baseQuestions"]
        assert len(qs) == 25, f"{code}: expected 25 problems, got {len(qs)}"
        problems = []
        for idx, q in enumerate(qs, start=1):
            # IMPORTANT: the array order IS the problem order. The source's
            # `amc10ProblemNumber` field is unreliable (duplicates 6/11/15/21,
            # skips 9/13/19/25) — verified 2026-11-07: array positions match
            # both the diagram filenames (11.svg at position 11, 19.svg at
            # position 19, ...) and the AoPS Wiki answer keys. Use position.
            n = idx
            choices = {L: q[L.lower()] for L in "ABCDE"}
            for L, c in choices.items():
                assert c and c.strip(), f"{code} Q{n} choice {L} empty"
            assert (q["question"] or "").strip(), f"{code} Q{n} empty"
            ans = q["answer"].upper()
            assert ans in "ABCDE", f"{code} Q{n} bad answer {ans!r}"
            # Rewrite diagram <img src="/amc10/2024B/11.svg"> to a local file.
            # The data's src omits the real prefix: the rendered page serves
            # the same file at /images/past-contests/amc10/2024B/11.svg.
            qhtml = q["question"]
            for src in sorted(set(re.findall(r'<img\s+src="([^"]+)"', qhtml))):
                fname = Path(src).name
                local = DIAG / code / f"q{n}.svg"
                local.parent.mkdir(parents=True, exist_ok=True)
                if not local.exists():
                    data = fetch(BASE + "/images/past-contests" + src)
                    stripped = data.lstrip()
                    assert stripped.startswith(b"<svg") or stripped.startswith(
                        b"<?xml"), f"{src} not svg"
                    local.write_bytes(data)
                    print(f"   diagram Q{n}: {src} -> {local} ({len(data)} bytes)")
                qhtml = qhtml.replace(
                    f'src="{src}"',
                    f'src="assets/diagrams/{code}/q{n}.svg"')
            problems.append({
                "n": n,
                "sourceNumber": q.get("amc10ProblemNumber"),
                "question": qhtml,
                "choices": choices,
                "answer": ans,
                "concepts": q.get("concepts", ""),
                "hints": q.get("hints", []),
                "solution": q.get("solutions", ""),
                "solveTimeSeconds": q.get("solveTimeSeconds"),
            })
        problems.sort(key=lambda p: p["n"])
        key = "".join(p["answer"] for p in problems)
        print(f"   answer key: {key}")
        if key != EXPECTED_KEYS[code]:
            failures.append(
                f"{code}: key mismatch vs AoPS Wiki: {key} != {EXPECTED_KEYS[code]}")
        out = {
            "exam": label,
            "examId": f"amc10{code[-1].lower()}-2024",
            "year": 2024,
            "grade": 10,
            "version": code[-1],
            "numProblems": 25,
            "timeSeconds": 4500,
            "scoring": {"correct": 6, "blank": 1.5, "wrong": 0},
            "source": "Problems (c) Mathematical Association of America (MAA). "
                      "Sourced from LIVE by Po-Shen Loh past-contest pages "
                      f"({url}); answer key cross-checked against the AoPS Wiki "
                      f"2024 AMC 10{code[-1]} Answer Key.",
            "problems": problems,
        }
        (DATA / f"amc10{code[-1].lower()}-2024.json").write_text(
            json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"   wrote {len(problems)} problems")
    if failures:
        print("FAILURES:", failures)
        sys.exit(1)
    print("OK — all data files written and answer keys verified.")


if __name__ == "__main__":
    main()
