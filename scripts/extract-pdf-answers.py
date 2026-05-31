"""
Extract correct answers from official PDF by detecting underlined text.

PDF: public/questions/600-cau-hoi-thi-ly-thuyet-lai-xe_daotaolaixehd.pdf (text PDF, 186 pages)

Logic:
  - On each page, find all thin horizontal rectangles (height < 2px, width > 10) → underline candidates.
  - Group text into lines, identify question boundary by bold "Câu N." pattern, identify answer
    lines by pattern "N. ..." where N in 1..4.
  - For each answer line, check if any underline rect is directly below the text → that answer is correct.
  - Multi-line answers: any line of the answer being underlined marks the answer as correct.

Output:
  reports/pdf-correct-answers.json — { "1": {"correctIndex": 1, "answerText": "..."}, ... }
  reports/pdf-extraction-issues.json — câu không extract được (phải verify thủ công)

Usage:
  python3 scripts/extract-pdf-answers.py
"""

import json
import os
import re
import sys
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    print("Cần cài pdfplumber: pip install pdfplumber --break-system-packages")
    sys.exit(1)

PDF_PATH = Path("public/questions/600-cau-hoi-thi-ly-thuyet-lai-xe_daotaolaixehd.pdf")
OUT_DIR = Path("reports")
OUT_DIR.mkdir(exist_ok=True)
OUT_ANSWERS = OUT_DIR / "pdf-correct-answers.json"
OUT_ISSUES = OUT_DIR / "pdf-extraction-issues.json"

# Tunable thresholds
UNDERLINE_MAX_HEIGHT = 2.0       # rect height under this counts as underline
UNDERLINE_MIN_WIDTH = 10         # rect wider than this counts as underline
TEXT_NEAR_UNDERLINE_Y = 4.0      # char.bottom must be within this many px above underline.top
ANSWER_RE = re.compile(r"^([1-4])\.\s+(.*)")
QUESTION_RE = re.compile(r"^Câu\s+(\d+)\.\s+(.*)", re.IGNORECASE)


def group_chars_into_lines(chars, y_tolerance=2.0):
    """Group chars into lines by similar y. Returns list of (line_text, top, bottom, chars)."""
    if not chars:
        return []
    chars_sorted = sorted(chars, key=lambda c: (c["top"], c["x0"]))
    lines = []
    current = [chars_sorted[0]]
    for c in chars_sorted[1:]:
        if abs(c["top"] - current[-1]["top"]) <= y_tolerance:
            current.append(c)
        else:
            lines.append(current)
            current = [c]
    lines.append(current)
    out = []
    for line_chars in lines:
        line_chars.sort(key=lambda c: c["x0"])
        text = "".join(c["text"] for c in line_chars)
        top = min(c["top"] for c in line_chars)
        bottom = max(c["bottom"] for c in line_chars)
        x0 = min(c["x0"] for c in line_chars)
        x1 = max(c["x1"] for c in line_chars)
        is_bold = any("Bold" in (c.get("fontname") or "") for c in line_chars)
        out.append({
            "text": text,
            "top": top,
            "bottom": bottom,
            "x0": x0,
            "x1": x1,
            "chars": line_chars,
            "is_bold": is_bold,
        })
    return out


def is_underline_under_line(line, underlines):
    """Check if any underline rect sits directly below this text line."""
    for ul in underlines:
        if ul["height"] >= UNDERLINE_MAX_HEIGHT or ul["width"] < UNDERLINE_MIN_WIDTH:
            continue
        # underline top should be within TEXT_NEAR_UNDERLINE_Y px of line bottom
        if abs(ul["top"] - line["bottom"]) <= TEXT_NEAR_UNDERLINE_Y:
            # x overlap should be significant (at least 30% of line width)
            overlap = max(0, min(ul["x1"], line["x1"]) - max(ul["x0"], line["x0"]))
            line_width = line["x1"] - line["x0"]
            if line_width > 0 and overlap / line_width > 0.2:
                return True
    return False


def extract_from_pdf(pdf_path):
    """Walk PDF pages, return dict {question_id: {"correctIndex": int, "answerText": str}}."""
    results = {}
    issues = []

    # Streaming state across pages (question can span pages)
    current_qid = None
    current_answers = []  # list of {"index": int (0-3), "lines": [line], "underlined": bool}
    page_pending = None  # carry text line if a question's answer was being accumulated

    def flush_current():
        nonlocal current_qid, current_answers
        if current_qid is None:
            return
        # Find first underlined answer
        correct_idx = None
        for ans in current_answers:
            if ans["underlined"]:
                correct_idx = ans["index"]
                if correct_idx not in (None,):
                    break
        if correct_idx is None:
            issues.append({
                "questionId": current_qid,
                "reason": "no-underline-detected",
                "answerCount": len(current_answers),
                "answerTexts": [" ".join(line["text"] for line in a["lines"]) for a in current_answers],
            })
        else:
            ans = next(a for a in current_answers if a["index"] == correct_idx)
            text = " ".join(line["text"] for line in ans["lines"]).strip()
            results[current_qid] = {
                "correctIndex": correct_idx,  # 0-based
                "answerText": text,
                "answerCount": len(current_answers),
            }
        current_qid = None
        current_answers = []

    with pdfplumber.open(pdf_path) as pdf:
        for page_index, page in enumerate(pdf.pages):
            chars = page.chars
            if not chars:
                continue
            lines = group_chars_into_lines(chars)
            # Underline rects on this page
            underlines = [r for r in page.rects if r.get("height", 99) < UNDERLINE_MAX_HEIGHT and r.get("width", 0) > UNDERLINE_MIN_WIDTH]

            current_answer = None  # ref to entry in current_answers

            for line in lines:
                text = line["text"].strip()
                if not text:
                    continue
                # Skip page numbers (just a number on its own)
                if re.match(r"^\d+$", text):
                    continue

                # Check question start
                qm = QUESTION_RE.match(text)
                if qm and line["is_bold"]:
                    # New question — flush previous
                    flush_current()
                    current_qid = int(qm.group(1))
                    current_answers = []
                    current_answer = None
                    # The question text might continue on next line (still bold). Don't track those.
                    continue

                # If we're inside a bold line that continues the question prompt, skip (don't treat as answer).
                if line["is_bold"] and current_qid is not None and not ANSWER_RE.match(text):
                    continue

                # Check answer start
                am = ANSWER_RE.match(text)
                if am and current_qid is not None:
                    idx = int(am.group(1)) - 1  # 0-based
                    current_answer = {"index": idx, "lines": [line], "underlined": False}
                    if is_underline_under_line(line, underlines):
                        current_answer["underlined"] = True
                    current_answers.append(current_answer)
                    continue

                # Continuation of current answer (no "N." prefix, in regular font)
                if current_answer is not None and current_qid is not None and not line["is_bold"]:
                    current_answer["lines"].append(line)
                    if is_underline_under_line(line, underlines):
                        current_answer["underlined"] = True

    # Flush last
    flush_current()
    return results, issues


def main():
    print(f"Đọc PDF: {PDF_PATH}")
    if not PDF_PATH.exists():
        print(f"PDF không tồn tại: {PDF_PATH}")
        sys.exit(1)

    results, issues = extract_from_pdf(PDF_PATH)

    with OUT_ANSWERS.open("w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    with OUT_ISSUES.open("w", encoding="utf-8") as f:
        json.dump(issues, f, ensure_ascii=False, indent=2)

    print(f"\n=== EXTRACTION SUMMARY ===")
    print(f"Câu trích được correctIndex: {len(results)} / 600")
    print(f"Câu KHÔNG extract được: {len(issues)}")
    if issues:
        print(f"  Sample issues:")
        for issue in issues[:5]:
            print(f"  - Câu {issue['questionId']}: {issue['reason']} (answerCount={issue['answerCount']})")
    print(f"\nOutput:")
    print(f"  {OUT_ANSWERS}")
    print(f"  {OUT_ISSUES}")


if __name__ == "__main__":
    main()
