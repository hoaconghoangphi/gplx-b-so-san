import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(".codex-temp/pymupdf")))

import fitz  # type: ignore


CATEGORY_RANGES = [
    ("Quy định chung và quy tắc giao thông đường bộ", 1, 180),
    ("Văn hóa giao thông, đạo đức người lái xe, PCCC và cứu hộ cứu nạn", 181, 205),
    ("Kỹ thuật lái xe", 206, 263),
    ("Cấu tạo và sửa chữa", 264, 300),
    ("Báo hiệu đường bộ", 301, 485),
    ("Giải thế sa hình và kỹ năng xử lý tình huống giao thông", 486, 600),
]


def get_category(question_id: int) -> str:
    for category, start, end in CATEGORY_RANGES:
        if start <= question_id <= end:
            return category
    return "Quy định chung và quy tắc giao thông đường bộ"


def main() -> None:
    pdfs = list(pathlib.Path("public/questions").glob("*.pdf"))
    if not pdfs:
        raise SystemExit("No PDF found in public/questions")

    pdf_path = pdfs[0]
    image_dir = pathlib.Path("public/questions/images")
    image_dir.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(str(pdf_path))
    manifest = []
    question_id = 1

    for page_index, page in enumerate(doc):
        image_items = []
        for image in page.get_images(full=True):
            xref = image[0]
            rects = page.get_image_rects(xref)
            if not rects:
                continue
            image_items.append((rects[0].y0, rects[0].x0, xref))

        for _, __, xref in sorted(image_items):
            data = doc.extract_image(xref)
            ext = data["ext"].lower()
            if ext == "jpeg":
                ext = "jpg"

            file_name = f"q{question_id:03d}.{ext}"
            path = image_dir / file_name
            path.write_bytes(data["image"])

            manifest.append(
                {
                    "id": question_id,
                    "page": page_index + 1,
                    "image": f"/questions/images/{file_name}",
                    "width": data.get("width"),
                    "height": data.get("height"),
                    "category": get_category(question_id),
                    "chapter": next(
                        index + 1
                        for index, (category, _, __) in enumerate(CATEGORY_RANGES)
                        if category == get_category(question_id)
                    ),
                }
            )
            question_id += 1

    labels = []
    for page in doc:
        labels.extend(int(value) for value in re.findall(r"Câu\s+(\d+)\s*/", page.get_text("text")))

    output = pathlib.Path("public/questions/manifest.json")
    output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"PDF: {pdf_path}")
    print(f"Pages: {doc.page_count}")
    print(f"Images extracted: {len(manifest)}")
    print(f"Question labels found in text layer: {len(labels)}")
    print(f"Manifest: {output}")

    if len(manifest) != 600:
        raise SystemExit(f"Expected 600 images, got {len(manifest)}")


if __name__ == "__main__":
    main()
