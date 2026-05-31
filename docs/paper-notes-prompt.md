# Handoff Prompt — Trích PDF mẹo giấy → memoryTip

> Phase 2 của dự án `gplx-b-so-san` (Phase 1: official captures → explanation đã xong, 132/600 câu có explanation).
> Phase này: trích các mẹo/quy luật từ PDF tài liệu giấy, fill vào field `memoryTip` của câu hỏi liên quan.
> Self-contained — đưa cho agent AI thực thi.

---

## 1. Bối cảnh

Repo: `gplx-b-so-san` — Next.js app học GPLX hạng B, 600 câu ở `src/data/questions.json`. Hiện trạng:
- 132/600 câu có `explanation` từ captures hệ thống chính thức (Phase 1)
- 9/600 câu có `memoryTip` (chỉ vài câu seed)
- **591/600 câu thiếu `memoryTip`** → đây là gap phase 2 đóng góp

Schema (xem `src/lib/types.ts`):
```ts
type Question = {
  id: number; chapter: number;
  question: string; answers: string[]; correctAnswer: number;
  // ...
  memoryTip?: string;        // ← FIELD CẦN FILL
  tipSource?: "paper-note" | "source" | "ai-draft" | "manual";
};
```

**Field cần touch:** `memoryTip`, `tipSource`. **KHÔNG đụng** các field khác.

## 2. Input — PDF tài liệu giấy

File: `reference/paper-notes/Hướng Dẫn và Mẹo Làm Bài.pdf`

Đặc điểm:
- **Scanned image PDF** (tạo bởi ImageMagick, không có text layer) → bắt buộc OCR
- 7 trang, page size ~3213 x 5199 pts (ảnh cao, stitched từ nhiều trang giấy)
- ~178 MB → mỗi trang ~25 MB resolution cao
- Tiếng Việt, font sách in

Nội dung điển hình (đã verify qua 1 trang sample):
- **Danh sách 60 câu điểm liệt** (bảng số từ 19–260) — KHÔNG cần extract làm tip vì đã có trong validator
- **Mẹo nhóm câu hỏi** theo chủ đề: "Mẹo biển báo cấm", "Mẹo đường ưu tiên", "Mẹo thứ tự ưu tiên xe", "Mẹo số liệu", v.v.
- Mỗi mẹo là 1 đoạn ngắn (1–5 câu) áp dụng cho nhóm N câu hỏi cùng chủ đề

## 3. Pipeline đề xuất

### 3.1 Convert PDF → PNG per page
```bash
pdftoppm -r 200 -png "reference/paper-notes/Hướng Dẫn và Mẹo Làm Bài.pdf" /tmp/paper-page
```
Sẽ tạo `/tmp/paper-page-1.png` … `/tmp/paper-page-7.png`. Có thể dùng `pdf2image` (Python) hoặc `sharp` (Node) cũng được.

### 3.2 OCR mỗi page
Dùng `tesseract.js@^7` + `vie.traineddata` (ở root repo). Lưu output thành `/tmp/paper-page-N.txt`.

Tham số khuyên: `psm: 6` (assume uniform block of text) hoặc `psm: 4` (single column of text).

Resolution 200 DPI là OK cho font sách in tiếng Việt.

### 3.3 Chunk text thành các "mẹo block"

Mỗi page sau OCR ra ~1500–3000 từ. Chunk theo heuristic:

1. **Heading detection**: dòng nào in đậm/in hoa và ngắn (< 60 ký tự) → ứng viên heading. Pattern thường thấy:
   - `MẸO [TÊN CHỦ ĐỀ]`
   - `[N]. [Tên section]`
   - `Quy luật ...`
   - `Cách nhớ ...`
2. **Bảng số 60 câu điểm liệt** (trang đầu): skip, không tạo chunk.
3. Mỗi chunk có:
   ```json
   {
     "chunkId": "page1-mẹo-biển-báo-cấm",
     "page": 1,
     "topic": "Mẹo biển báo cấm",
     "text": "<full text của chunk, đã clean OCR noise>",
     "keywords": ["biển báo cấm", "cấm rẽ", "cấm vượt", ...]  // tự extract 3-8 keyword đặc trưng
   }
   ```

### 3.4 Extract keywords từ chunk

Cho mỗi chunk text:
- Loại stopwords tiếng Việt (`xe`, `đường`, `là`, `của`, `được`, `khi`, `phải`, `không`, `có`, `cho`, `trong`, `với`, `để`, `về`, `theo`, `này`, `đó`, `các`, `những`, `và`, `hoặc`).
- Lấy top 3–8 token có TF cao nhất trong chunk, length ≥ 4 ký tự.
- Bao gồm cả bigram nếu xuất hiện ≥ 2 lần (vd "biển báo cấm", "đường ưu tiên").

### 3.5 Match chunk → questions

Với mỗi chunk:
1. Cho mỗi câu trong `questions.json`:
   - Build search corpus = `question + " " + answers.join(" ")`, normalize (lowercase, remove diacritics, remove punctuation).
   - Đếm số keyword (đã normalize tương tự) xuất hiện trong corpus.
   - `match_score = (keyword_hits / total_keywords) * bigram_boost`
   - `bigram_boost`: nếu match được bigram (2-word keyword) thì × 1.5.
2. Threshold:
   - `≥ 0.85` → **auto-apply** vào `memoryTip` (high confidence)
   - `0.50 – 0.85` → **draft, cần review** (medium)
   - `< 0.50` → reject

1 chunk có thể match nhiều câu — đó là pattern bình thường (1 mẹo cho 1 nhóm câu). 1 câu cũng có thể match nhiều chunk — chọn chunk có score cao nhất.

### 3.6 Apply

Với entry auto-apply (score ≥ 0.85):
- Nếu `memoryTip` câu đó hiện trống → ghi: `memoryTip = chunk.text` (rút gọn ≤ 300 ký tự), `tipSource = "paper-note"`.
- Nếu `memoryTip` đã có (từ seed cũ hoặc trùng) → **không ghi đè**, log vào duplicates.

Với entry medium (0.50–0.85): chỉ ghi vào draft file, không apply JSON.

## 4. Output

```
reports/paper-tips-applied.json    — auto-applied entries
reports/paper-tips-draft.json      — medium-confidence, cần user review
reports/paper-tips-rejected.json   — low-confidence, không apply
reports/paper-tips-summary.md      — báo cáo tổng
docs/paper-tips-chunks.json        — list các chunk đã extract (để debug/reuse)
```

Mỗi entry trong `paper-tips-applied.json`:
```json
{
  "questionId": 47,
  "chunkId": "page2-mẹo-vượt-xe",
  "topic": "Mẹo vượt xe",
  "page": 2,
  "tipText": "Cấm vượt khi: xe trước xin vượt, đường vòng/dốc tầm nhìn hạn chế, cầu hẹp.",
  "matchScore": 0.91,
  "keywordsMatched": ["vượt xe", "cấm vượt", "đường vòng"],
  "keywordsTotal": 5
}
```

## 5. Constraints (BẮT BUỘC)

- **KHÔNG ghi đè** câu có `memoryTip` hiện tại (giữ nguyên).
- **KHÔNG ghi đè** câu có `tipSource` là `"manual"` hoặc `"source"`.
- **KHÔNG đụng** field khác (`explanation`, `correctAnswer`, `critical`, …).
- Rút gọn `memoryTip` ≤ 300 ký tự. Nếu chunk text dài hơn → cắt câu đầu tiên (đến `.` hoặc `;` đầu tiên) làm tip, hoặc paraphrase ngắn gọn.
- `memoryTip` phải đọc được, dễ nhớ. Tránh đoạn lủng củng. Nếu chunk OCR có noise → clean trước (tương tự cleanup ở ingest captures v3 mục 4.5).
- Encoding UTF-8, giữ dấu tiếng Việt.

## 6. Chống corrupt JSON (giữ y phase 1)

1. Đọc file → parse → modify in memory → `JSON.stringify` → `writeFileSync` 1 lần.
2. Re-read + re-parse, length === 600. Fail → `git checkout HEAD -- src/data/questions.json`, retry. Vẫn fail → STOP.
3. UTF-8, indent 2 spaces, kết thúc bằng `\n`.

## 7. QA checklist

- [ ] `npm run validate:data` exit 0
- [ ] File `src/data/questions.json` parse được, 600 câu
- [ ] Mọi câu được apply có `memoryTip` (non-empty) + `tipSource: "paper-note"`
- [ ] Không có câu nào bị thay đổi field ngoài `memoryTip`/`tipSource`
- [ ] Sample 5 entry trong `paper-tips-applied.json`: tipText đọc được, có nghĩa
- [ ] Bảng 60 câu điểm liệt KHÔNG bị extract thành tip (đó là danh sách số, không phải mẹo)

## 8. Báo cáo cuối

In console + ghi `reports/paper-tips-summary.md`:

```
=== PAPER TIPS SUMMARY ===
PDF pages OCR'd:           7
Chunks extracted:          N
  - by topic group:        N
  - skipped (60-câu list): N

Match results:
  Auto-applied (≥0.85):    N câu trong JSON
  Draft (0.5-0.85):        N câu cần review
  Rejected (<0.5):         N chunk-câu pairs

memoryTip coverage:        9 → N (tăng +N)
tipSource breakdown:
  paper-note: N
  (others giữ nguyên)

Câu thiếu memoryTip còn lại: N / 600
```

## 9. Đề xuất ngầm

Sau khi hoàn thành, đề xuất user mở `reports/paper-tips-draft.json` (cần review), xem từng entry, chấp nhận/từ chối/sửa. Có thể viết thêm script `apply-paper-tips-draft.mjs` chạy sau khi user review (nhưng không bắt buộc trong scope phase này).

Sẵn sàng. Bắt đầu.
