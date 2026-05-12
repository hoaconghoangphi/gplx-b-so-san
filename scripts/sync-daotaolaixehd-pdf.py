import json
import pathlib
import re
import sys
from dataclasses import dataclass

sys.path.insert(0, str(pathlib.Path(".codex-temp/pymupdf")))

import fitz  # type: ignore


PDF_PATH = pathlib.Path(".codex-temp/daotaolaixehd-600-2025.pdf")
DATA_PATH = pathlib.Path("src/data/questions.json")
MEDIA_DIR = pathlib.Path("public/questions/media")

CATEGORY_RANGES = [
    ("Quy định chung và quy tắc giao thông đường bộ", 1, 180),
    ("Văn hóa giao thông, đạo đức người lái xe, PCCC và cứu hộ cứu nạn", 181, 205),
    ("Kỹ thuật lái xe", 206, 263),
    ("Cấu tạo và sửa chữa", 264, 300),
    ("Báo hiệu đường bộ", 301, 485),
    ("Giải thế sa hình và kỹ năng xử lý tình huống giao thông", 486, 600),
]

CRITICAL_IDS = {
    19,
    20,
    21,
    22,
    23,
    24,
    25,
    26,
    27,
    28,
    30,
    32,
    34,
    35,
    47,
    48,
    52,
    53,
    55,
    58,
    63,
    64,
    65,
    66,
    67,
    68,
    70,
    71,
    72,
    73,
    74,
    85,
    86,
    87,
    88,
    89,
    90,
    91,
    92,
    93,
    97,
    98,
    102,
    117,
    163,
    165,
    167,
    197,
    198,
    206,
    215,
    226,
    234,
    245,
    246,
    252,
    253,
    254,
    255,
    260,
}


@dataclass
class Line:
    page: int
    text: str
    bbox: fitz.Rect


@dataclass
class ImageBlock:
    page: int
    bbox: fitz.Rect


def clean_text(value: str) -> str:
    value = value.replace("\u00a0", " ")
    value = re.sub(r"\s+", " ", value)
    value = re.sub(r"\s+([,.;:?!])", r"\1", value)
    return value.strip()


def get_category(question_id: int) -> tuple[str, int]:
    for index, (category, start, end) in enumerate(CATEGORY_RANGES, start=1):
        if start <= question_id <= end:
            return category, index
    raise ValueError(f"Question id out of range: {question_id}")


def is_before(page_a: int, y_a: float, page_b: int, y_b: float) -> bool:
    return page_a < page_b or (page_a == page_b and y_a < y_b)


def is_between(page: int, y: float, start: tuple[int, float], end: tuple[int, float] | None) -> bool:
    after_start = page > start[0] or (page == start[0] and y >= start[1])
    before_end = end is None or page < end[0] or (page == end[0] and y < end[1])
    return after_start and before_end


def collect_pdf_objects(doc: fitz.Document) -> tuple[list[Line], list[ImageBlock], dict[int, list[fitz.Rect]]]:
    lines: list[Line] = []
    images: list[ImageBlock] = []
    underlines: dict[int, list[fitz.Rect]] = {}

    for page_index, page in enumerate(doc):
        data = page.get_text("dict")
        for block in data["blocks"]:
            if block["type"] == 1:
                rect = fitz.Rect(block["bbox"])
                if rect.width > 20 and rect.height > 20:
                    images.append(ImageBlock(page_index, rect))
                continue

            if block["type"] != 0:
                continue

            for raw_line in block["lines"]:
                text = clean_text("".join(span["text"] for span in raw_line["spans"]))
                if not text:
                    continue
                lines.append(Line(page_index, text, fitz.Rect(raw_line["bbox"])))

        page_underlines = []
        for drawing in page.get_drawings():
            fill = drawing.get("fill")
            rect = drawing.get("rect")
            if not fill or not rect:
                continue

            is_black = all(channel < 0.08 for channel in fill)
            if is_black and 0.25 <= rect.height <= 2.5 and rect.width >= 10:
                page_underlines.append(fitz.Rect(rect))
        underlines[page_index] = page_underlines

    lines.sort(key=lambda line: (line.page, line.bbox.y0, line.bbox.x0))
    images.sort(key=lambda image: (image.page, image.bbox.y0, image.bbox.x0))
    return lines, images, underlines


def parse_pdf_text(doc: fitz.Document) -> dict[int, dict]:
    text = "\n".join(page.get_text("text") for page in doc)
    matches = list(re.finditer(r"Câu\s+(\d+)[.:]\s*", text))
    parsed: dict[int, dict] = {}

    for index, match in enumerate(matches):
        question_id = int(match.group(1))
        if question_id < 1 or question_id > 600:
            continue

        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        segment = text[match.end() : end].strip()
        segment = re.sub(r"\s*CHƯƠNG\s+[IVXLC]+\..*$", "", segment, flags=re.S).strip()
        segment = re.sub(r"\s{2,}([1-4])\.\s+", r"\n\1. ", segment)
        answer_matches = list(re.finditer(r"(?m)^\s*([1-4])\.\s+", segment))
        if not answer_matches:
            continue

        question = clean_text(segment[: answer_matches[0].start()])
        answers = []
        for answer_index, answer_match in enumerate(answer_matches):
            answer_end = answer_matches[answer_index + 1].start() if answer_index + 1 < len(answer_matches) else len(segment)
            answer = clean_text(segment[answer_match.end() : answer_end])
            answers.append(answer)

        if question and len(answers) >= 2:
            parsed[question_id] = {"question": question, "answers": answers}

    return parsed


def find_question_positions(lines: list[Line]) -> dict[int, Line]:
    positions: dict[int, Line] = {}
    for line in lines:
        for match in re.finditer(r"Câu\s+(\d+)[.:]", line.text):
            question_id = int(match.group(1))
            if 1 <= question_id <= 600 and question_id not in positions:
                positions[question_id] = line
    return positions


def answer_line_map(lines: list[Line], positions: dict[int, Line], question_id: int) -> dict[int, list[Line]]:
    start = positions.get(question_id)
    if not start:
        return {}

    next_start = positions.get(question_id + 1)
    start_pos = (start.page, start.bbox.y0)
    end_pos = (next_start.page, next_start.bbox.y0) if next_start else None
    answers: dict[int, list[Line]] = {}
    current_answer: int | None = None

    for line in lines:
        if not is_between(line.page, line.bbox.y0, start_pos, end_pos):
            continue
        marker = re.match(r"^([1-4])\.\s+", line.text)
        if marker:
            current_answer = int(marker.group(1)) - 1
            answers.setdefault(current_answer, []).append(line)
        elif current_answer is not None:
            answers.setdefault(current_answer, []).append(line)

    return answers


def detect_correct_answer(answer_lines: dict[int, list[Line]], underlines: dict[int, list[fitz.Rect]]) -> int | None:
    scores: dict[int, float] = {}

    for answer_index, lines in answer_lines.items():
        for line in lines:
            for underline in underlines.get(line.page, []):
                vertical_match = line.bbox.y0 <= underline.y0 <= line.bbox.y1 + 4
                horizontal_overlap = max(0, min(line.bbox.x1, underline.x1) - max(line.bbox.x0, underline.x0))
                if vertical_match and horizontal_overlap > 4:
                    scores[answer_index] = scores.get(answer_index, 0) + horizontal_overlap

    if not scores:
        return None
    return max(scores.items(), key=lambda item: item[1])[0]


def crop_question_images(doc: fitz.Document, images: list[ImageBlock], positions: dict[int, Line]) -> dict[int, str]:
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    result: dict[int, str] = {}

    for question_id in range(1, 601):
        start = positions.get(question_id)
        if not start:
            continue

        next_start = positions.get(question_id + 1)
        start_pos = (start.page, start.bbox.y0)
        end_pos = (next_start.page, next_start.bbox.y0) if next_start else None
        assigned = [
            image
            for image in images
            if is_between(image.page, (image.bbox.y0 + image.bbox.y1) / 2, start_pos, end_pos)
        ]
        if not assigned:
            continue

        # In this PDF each question image stays on one page. If a future PDF splits it,
        # keeping the largest page group avoids accidentally merging neighboring questions.
        by_page: dict[int, list[ImageBlock]] = {}
        for image in assigned:
            by_page.setdefault(image.page, []).append(image)
        page_index, page_images = max(by_page.items(), key=lambda item: sum(block.bbox.get_area() for block in item[1]))

        rect = page_images[0].bbox
        for image in page_images[1:]:
            rect |= image.bbox

        page = doc[page_index]
        padding = 0
        clip = fitz.Rect(
            max(0, rect.x0 - padding),
            max(0, rect.y0 - padding),
            min(page.rect.width, rect.x1 + padding),
            min(page.rect.height, rect.y1 + padding),
        )
        pixmap = page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=clip, alpha=False)
        file_name = f"q{question_id:03d}.jpg"
        output_path = MEDIA_DIR / file_name
        pixmap.save(str(output_path), jpg_quality=92)
        result[question_id] = f"/questions/media/{file_name}"

    return result


def main() -> None:
    if not PDF_PATH.exists():
        raise SystemExit(f"Missing PDF: {PDF_PATH}")

    doc = fitz.open(PDF_PATH)
    current = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    by_id = {item["id"]: item for item in current}

    lines, images, underlines = collect_pdf_objects(doc)
    parsed = parse_pdf_text(doc)
    positions = find_question_positions(lines)
    media = crop_question_images(doc, images, positions)

    updated = []
    changed_text = 0
    changed_answers = 0
    changed_correct = 0
    changed_images = 0
    missing = []

    for question_id in range(1, 601):
        source = parsed.get(question_id)
        existing = by_id.get(question_id, {})
        category, chapter = get_category(question_id)

        if not source:
            missing.append(question_id)
            source = {
                "question": existing.get("question", ""),
                "answers": existing.get("answers", []),
            }

        answer_lines = answer_line_map(lines, positions, question_id)
        correct_answer = detect_correct_answer(answer_lines, underlines)
        if correct_answer is None or correct_answer >= len(source["answers"]):
            correct_answer = existing.get("correctAnswer", 0)

        next_item = {
            "id": question_id,
            "category": category,
            "chapter": chapter,
            "question": source["question"],
            "answers": source["answers"],
            "correctAnswer": correct_answer,
            "critical": question_id in CRITICAL_IDS,
            "image": media.get(question_id),
            "sourceImage": existing.get("sourceImage"),
            "explanation": existing.get("explanation", ""),
        }

        if existing.get("question") != next_item["question"]:
            changed_text += 1
        if existing.get("answers") != next_item["answers"]:
            changed_answers += 1
        if existing.get("correctAnswer") != next_item["correctAnswer"]:
            changed_correct += 1
        if existing.get("image") != next_item["image"]:
            changed_images += 1

        updated.append(next_item)

    DATA_PATH.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Parsed questions: {len(parsed)}")
    print(f"Question positions: {len(positions)}")
    print(f"Cropped media: {len(media)}")
    print(f"Changed prompts: {changed_text}")
    print(f"Changed answer sets: {changed_answers}")
    print(f"Changed correct answers: {changed_correct}")
    print(f"Changed image refs: {changed_images}")
    if missing:
        print("Missing parsed question ids:", ", ".join(map(str, missing[:40])))


if __name__ == "__main__":
    main()
