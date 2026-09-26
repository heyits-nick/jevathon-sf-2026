"""Check test cases in data/cases/ for schema errors.

Usage:
    python3 data/validate.py            # schema check only, no network
    python3 data/validate.py --live     # also confirm each quote still appears on the menu page

--live fetches pages with curl and reads PDFs with pdftotext (both must be installed).
It checks our labels against the source; it does not call the app or Jev.
"""
import html
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

CASES = Path(__file__).parent / "cases"
LABEL = "DEVELOPMENT/TEST DATA - hand-labeled expected answers, not a live result"
REQUIRED = ["label", "id", "restaurant", "menu_url", "diet", "menu_format",
            "checked_at", "checked_by", "case_type", "expected_dishes", "notes"]
VERDICTS = {"yes", "no", "unclear"}
CASE_TYPES = {"clear_pass", "clear_fail", "ambiguous"}
FORMATS = {"html", "pdf", "image"}
DIETS = {"vegan", "vegetarian", "gluten-free", "celiac"}


def norm(s):
    s = html.unescape(s).replace("’", "'").replace("–", "-")
    return re.sub(r"\s+", " ", s).strip().lower()


def page_text(url, fmt):
    body = subprocess.run(["curl", "-sSfL", "-m", "20", "-A", "Mozilla/5.0", url],
                          capture_output=True, check=True).stdout
    if fmt == "pdf":
        if not shutil.which("pdftotext"):
            raise RuntimeError("pdftotext not installed")
        with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
            f.write(body)
            f.flush()
            return subprocess.run(["pdftotext", f.name, "-"], capture_output=True,
                                  text=True, check=True).stdout
    s = body.decode("utf-8", "ignore")
    s = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", s)
    return re.sub(r"<[^>]+>", " ", s)


def check(path, live):
    errors = []
    c = json.loads(path.read_text(encoding="utf-8"))
    missing = [k for k in REQUIRED if k not in c]
    if missing:
        return [f"missing fields: {missing}"]
    if c["label"] != LABEL:
        errors.append("label changed")
    if c["id"] != path.stem:
        errors.append(f"id {c['id']!r} does not match file name")
    if not isinstance(c["case_type"], str) or c["case_type"] not in CASE_TYPES:
        errors.append(f"bad case_type {c['case_type']!r}")
    if not isinstance(c["diet"], str) or c["diet"] not in DIETS:
        errors.append(f"bad diet {c['diet']!r}")
    if not isinstance(c["menu_format"], str) or c["menu_format"] not in FORMATS:
        errors.append(f"bad menu_format {c['menu_format']!r}")
    if not isinstance(c["expected_dishes"], list) or not c["expected_dishes"]:
        return errors + ["expected_dishes must be a nonempty list"]
    for i, d in enumerate(c["expected_dishes"]):
        if not isinstance(d, dict) or not all(
                isinstance(d.get(k), str) and d[k].strip() for k in ("name", "evidence")):
            errors.append(f"dish {i}: must be an object with nonempty name and evidence")
            continue
        if d.get("verdict") not in VERDICTS:
            errors.append(f"{d['name']}: bad verdict {d.get('verdict')!r}")
    if live and not errors:
        try:
            text = norm(page_text(c["menu_url"], c["menu_format"]))
        except Exception as e:  # report and continue; a dead URL is a finding
            return [f"could not fetch {c['menu_url']}: {e}"]
        for d in c["expected_dishes"]:
            for part in (d["name"], d["evidence"]):
                # PDF menus put "|" between description and tags; compare pieces
                for piece in part.split("|"):
                    if norm(piece) and norm(piece) not in text:
                        errors.append(f"{d['name']}: not found on page: {piece.strip()!r}")
    return errors


def main():
    live = "--live" in sys.argv
    failed = 0
    for path in sorted(CASES.glob("*.json")):
        errors = check(path, live)
        failed += bool(errors)
        print(("FAIL " if errors else "ok   ") + path.name)
        for e in errors:
            print("     " + e)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
