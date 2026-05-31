"""
Extract correct answers from official PDF by detecting underlined text.
Supports 1-column and 2-column answer layouts (chương 5 biển báo).
"""

import json
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

UNDERLINE_MAX_HEIGHT = 2.0
UNDERLINE_MIN_WIDTH = 10
TEXT_NEAR_UNDERLINE_Y = 4.0
ANSWER_RE = re.compile(r"^([1-4])\.\s+(.*)")
QUESTION_RE = re.compile(r"^Câu\s+(\d+)\.\s+(.*)", re.IGNORECASE)


def group_chars_into_lines(chars, y_tolerance=2.0):
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
            "text": text, "top": top, "bottom": bottom,
            "x0": x0, "x1": x1, "chars": line_chars, "is_bold": is_bold,
        })
    return out


def detect_answer_segments(line):
    """Find all 'N. ' prefix positions in line chars; split into sub-answers for 2-col layout.

    pdfplumber includes space chars trong page.chars (Microsoft Word PDF).
    → detect prefix bằng: digit "1-4" theo sau ".", trước là start-of-line HOẶC ≥3 space chars.
    """
    chars = line["chars"]
    if not chars:
        return []
    prefix_positions = []
    for i, ch in enumerate(chars):
        if ch["text"] not in "1234":
            continue
        if i + 1 >= len(chars) or chars[i + 1]["text"] != ".":
            continue
        if i == 0:
            ok = True
        else:
            space_count = 0
            j = i - 1
            while j >= 0 and chars[j]["text"] == " ":
                space_count += 1
                j -= 1
            ok = (j < 0) or space_count >= 3
        if not ok:
            continue
        prefix_positions.append((i, int(ch["text"]), ch["x0"]))
    if not prefix_positions:
        return []
    segments = []
    for k, (start_i, digit, x0) in enumerate(prefix_positions):
        end_i = prefix_positions[k + 1][0] if k + 1 < len(prefix_positions) else len(chars)
        seg_chars = chars[start_i:end_i]
        seg_text = "".join(c["text"] for c in seg_chars).strip()
        m = ANSWER_RE.match(seg_text)
        clean_text = m.group(2).strip() if m else seg_text
        seg_x1 = max((c["x1"] for c in seg_chars), default=x0)
        segments.append({"index": digit - 1, "x0": x0, "x1": seg_x1, "text": clean_text})
    return segments


def is_underline_in_range(line, underlines, x0, x1):
    for ul in underlines:
        if ul["height"] >= UNDERLINE_MAX_HEIGHT or ul["width"] < UNDERLINE_MIN_WIDTH:
            continue
        if abs(ul["top"] - line["bottom"]) > TEXT_NEAR_UNDERLINE_Y:
            continue
        overlap = max(0, min(ul["x1"], x1) - max(ul["x0"], x0))
        range_width = max(1, x1 - x0)
        if overlap / range_width > 0.2:
            return True
    return False


def extract_from_pdf(pdf_path):
    results = {}
    issues = []
    current_qid = None
    current_answers = []

    def flush_current():
        nonlocal current_qid, current_answers
        if current_qid is None:
            return
        correct_idx = None
        for ans in current_answers:
            if ans["underlined"]:
                correct_idx = ans["index"]
                break
        if correct_idx is None:
            issues.append({
                "questionId": current_qid,
                "reason": "no-underline-detected",
                "answerCount": len(current_answers),
                "answerTexts": [a.get("text_first", "") for a in current_answers],
            })
        else:
            ans = next(a for a in current_answers if a["index"] == correct_idx)
            text = ans.get("text_first", "")
            results[current_qid] = {
                "correctIndex": correct_idx,
                "answerText": text,
                "answerCount": len(current_answers),
            }
        current_qid = None
        current_answers = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            chars = page.chars
            if not chars:
                continue
            lines = group_chars_into_lines(chars)
            underlines = [r for r in page.rects if r.get("height", 99) < UNDERLINE_MAX_HEIGHT and r.get("width", 0) > UNDERLINE_MIN_WIDTH]
            current_answer = None
            for line in lines:
                text = line["text"].strip()
                if not text:
                    continue
                if re.match(r"^\d+$", text):
                    continue
                qm = QUESTION_RE.match(text)
                if qm and line["is_bold"]:
                    flush_current()
                    current_qid = int(qm.group(1))
                    current_answers = []
                    current_answer = None
                    continue
                if line["is_bold"] and current_qid is not None and not ANSWER_RE.match(text):
                    continue
                segments = detect_answer_segments(line)
                if segments and current_qid is not None:
                    for seg in segments:
                        is_underlined = is_underline_in_range(line, underlines, seg["x0"], seg["x1"])
                        ans = {
                            "index": seg["index"],
                            "lines": [line],
                            "underlined": is_underlined,
                            "text_first": seg["text"],
                            "x_range": (seg["x0"], seg["x1"]),
                        }
                        current_answers.append(ans)
                    current_answer = current_answers[-1] if current_answers else None
                    continue
                if current_answer is not None and current_qid is not None and not line["is_bold"]:
                    current_answer["lines"].append(line)
                    x0, x1 = current_answer.get("x_range", (line["x0"], line["x1"]))
                    if is_underline_in_range(line, underlines, x0, x1):
                        current_answer["underlined"] = True
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
    print(f"Câu trích được: {len(results)} / 600")
    print(f"Câu không trích được: {len(issues)}")
    if issues:
        print("Sample issues:")
        for issue in issues[:10]:
            print(f"  Câu {issue['questionId']}: {issue['reason']} (answerCount={issue['answerCount']})")


if __name__ == "__main__":
    main()
