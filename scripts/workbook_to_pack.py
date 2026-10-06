"""Convert the events team's answer workbook into the app's private event pack, then check it cell by cell.

    python scripts/workbook_to_pack.py "C:/path/family_feud_board.xlsx"

Writes private/event-pack.json (git-ignored) and prints an audit. The workbook is only ever read.
Contains no answer data itself, so it is safe to keep in the repository.

Score = column F (Points), kept as the answer's `count` because the engine scores that field.
Column E (Votes) is kept beside it as `votes`. Column G is kept as moderator-only `notes`.
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

sys.stdout.reconfigure(encoding="utf-8")

SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else None
OUT = Path(__file__).resolve().parent.parent / "data" / "event" / "event_pack.json"
HEADER = ["Q#", "Question", "Rank", "Answer", "Votes", "Points", "Counts as (what people wrote)"]
FIRST, LAST = 6, 78

# The order the questions are played in, as workbook question numbers (position 1 is the first in the list).
# Games of four: positions 1-4, 5-8 and 9-12 are one team pair each, 13-14 are spares. Questions with similar answers
# (eating: 8, 9, 4; doomscrolling: 1, 11, 13; Dubai: 6, 7, 14; bag and forgotten items: 2 and 12) sit in different games,
# at least four places apart.
ORDER = [1, 8, 6, 2, 11, 9, 7, 3, 13, 4, 14, 5, 10, 12]

# Reference totals from the release brief: question -> (answers, votes retained, points total).
REFERENCE = {
    1: (5, 26, 82), 2: (7, 28, 87), 3: (5, 26, 81), 4: (6, 26, 82), 5: (5, 29, 90), 6: (5, 28, 87), 7: (5, 20, 63),
    8: (5, 26, 81), 9: (5, 26, 82), 10: (5, 26, 80), 11: (5, 27, 85), 12: (5, 25, 78), 13: (5, 28, 87), 14: (5, 27, 84),
}


def half_up(votes: int, respondents: int, scale: int) -> int:
    """Excel ROUND(votes / respondents * scale, 0): halves go up (12.5 -> 13), not to even."""
    return (votes * scale * 2 + respondents) // (2 * respondents)


def read(path: Path):
    formulas = openpyxl.load_workbook(path).active
    cached = openpyxl.load_workbook(path, data_only=True).active
    return formulas, cached


def convert(path: Path) -> dict:
    f, v = read(path)
    problems = []
    if f.title != "Board":
        problems.append(f"sheet is {f.title!r}, expected 'Board'")
    respondents, scale = v["B1"].value, v["B2"].value
    if (respondents, scale) != (32, 100):
        problems.append(f"B1/B2 are {respondents}/{scale}, expected 32/100")
    if [f.cell(5, c).value for c in range(1, 8)] != HEADER:
        problems.append("header row 5 differs from the expected seven columns")
    if f.max_row != LAST:
        problems.append(f"last row is {f.max_row}, expected {LAST}")

    questions: dict[int, dict] = {}
    for r in range(FIRST, LAST + 1):
        q, prompt, rank, text, votes, _, notes = (f.cell(r, c).value for c in range(1, 8))
        formula, points = f.cell(r, 6).value, v.cell(r, 6).value
        if formula != f"=ROUND(E{r}/$B$1*$B$2,0)":
            problems.append(f"F{r}: formula is {formula!r}")
        if points != half_up(votes, respondents, scale):
            problems.append(f"F{r}: cached {points} but half-up of {votes}/{respondents} is {half_up(votes, respondents, scale)}")
        if not isinstance(text, str) or text != text.strip() or not text:
            problems.append(f"D{r}: answer text is blank or padded: {text!r}")
        entry = questions.setdefault(q, {"prompt": prompt, "rows": []})
        if entry["prompt"] != prompt:
            problems.append(f"B{r}: prompt differs from earlier rows of question {q}")
        entry["rows"].append((r, rank, text, votes, points, notes if notes is not None else ""))

    if sorted(ORDER) != sorted(questions):
        problems.append(f"ORDER {ORDER} does not list exactly the workbook's questions {sorted(questions)}")
    pack_questions = []
    for pos, q in enumerate(ORDER, start=1):
        rows = questions[q]["rows"]
        if [r[1] for r in rows] != list(range(1, len(rows) + 1)):
            problems.append(f"question {q}: ranks are not 1..{len(rows)}")
        if any(rows[i][4] < rows[i + 1][4] for i in range(len(rows) - 1)):
            problems.append(f"question {q}: points are not in descending order")
        pack_questions.append({
            "id": f"w{pos:02d}",
            "category": "Event pack",
            "prompt": questions[q]["prompt"],
            "status": "ready",
            "survey": {
                "source": "events_team_workbook",
                "respondents": respondents,
                "responseMode": "single",
                "collectedAt": None,
                "note": f"Workbook question {q}, played as question {pos}. Points = round(votes / {respondents} x {scale}); retained answers need not total {scale}.",
            },
            "answers": [
                {"id": f"w{pos:02d}a{rank}", "rank": rank, "text": text, "count": points, "votes": votes, "aliases": [], "notes": notes}
                for (_, rank, text, votes, points, notes) in rows
            ],
            "approval": None,
        })
    if problems:
        raise SystemExit("Workbook does not match the expected shape:\n  " + "\n  ".join(problems))
    return {
        "schemaVersion": 1,
        "packId": "hello-world-2026-event",
        "title": "hello, world! Family Feud: event pack",
        "purpose": "event",
        "questions": pack_questions,
    }


def verify(pack_path: Path, xlsx: Path) -> list[str]:
    """Independent second pass: re-read both files and compare every row by source cell."""
    f, v = read(xlsx)
    pack = json.loads(pack_path.read_text(encoding="utf-8"))
    respondents, scale = v["B1"].value, v["B2"].value
    bad: list[str] = []
    by_row = {}
    for q in pack["questions"]:
        for a in q["answers"]:
            by_row[(ORDER[int(q["id"][1:]) - 1], a["rank"])] = (q, a)
    seen = 0
    for r in range(FIRST, LAST + 1):
        qn, prompt, rank, text, votes, _, notes = (f.cell(r, c).value for c in range(1, 8))
        points = v.cell(r, 6).value
        hit = by_row.get((qn, rank))
        if not hit:
            bad.append(f"row {r}: no answer for question {qn} rank {rank}")
            continue
        q, a = hit
        seen += 1
        for cell, want, got in (
            (f"B{r}", prompt, q["prompt"]), (f"D{r}", text, a["text"]), (f"E{r}", votes, a["votes"]),
            (f"F{r}", points, a["count"]), (f"G{r}", notes or "", a["notes"]),
        ):
            if want != got:
                bad.append(f"{cell}: workbook {want!r} but pack {got!r}")
        if a["count"] != half_up(a["votes"], respondents, scale):
            bad.append(f"row {r}: points {a['count']} is not half-up of {a['votes']} votes")
    answers = sum(len(q["answers"]) for q in pack["questions"])
    if seen != 73 or answers != 73:
        bad.append(f"expected 73 answers, matched {seen}, pack holds {answers}")
    for q in pack["questions"]:
        n = ORDER[int(q["id"][1:]) - 1]
        got = (len(q["answers"]), sum(a["votes"] for a in q["answers"]), sum(a["count"] for a in q["answers"]))
        if got != REFERENCE[n]:
            bad.append(f"question {n}: answers/votes/points {got} but the brief says {REFERENCE[n]}")
    if len(pack["questions"]) != 14:
        bad.append(f"expected 14 questions, pack holds {len(pack['questions'])}")
    # a tie must stay a tie, in source order
    q8 = next(q for q in pack["questions"] if q["id"] == f"w{ORDER.index(8) + 1:02d}")["answers"]
    if not (q8[0]["count"] == q8[1]["count"] == 25 and q8[0]["rank"] < q8[1]["rank"]):
        bad.append("question 8: the two 25-point answers are not tied in source order")
    return bad


if __name__ == "__main__":
    if SRC is None or not SRC.exists():
        raise SystemExit("usage: python scripts/workbook_to_pack.py path/to/family_feud_board.xlsx")
    pack = convert(SRC)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    bad = verify(OUT, SRC)
    print(f"wrote {OUT}")
    for q in pack["questions"]:
        pts = [a["count"] for a in q["answers"]]
        print(f"  {q['id']}: {len(pts)} answers, {sum(a['votes'] for a in q['answers'])} votes, {sum(pts)} points")
    print(f"{len(pack['questions'])} questions, {sum(len(q['answers']) for q in pack['questions'])} answers")
    if bad:
        print("VERIFY FAILED:\n  " + "\n  ".join(bad))
        raise SystemExit(1)
    print("verify: all 73 rows match their source cells; totals match the brief")
