# Handoff Prompt — Ingest official captures vào questions.json

> Đưa toàn bộ nội dung file này cho một agent AI khác. Prompt đã self-contained.
> Agent cần có quyền đọc file ảnh, đọc/ghi file JSON, và chạy Node/Python.

---

## 1. Bối cảnh dự án

Repo: `gplx-b-so-san` — web app Next.js 16 / React 19 / TypeScript / Tailwind v4 dùng để học và thi thử lý thuyết GPLX ô tô hạng B số sàn của Việt Nam. Bộ câu hỏi gồm **600 câu**, đã có sẵn ở `src/data/questions.json`.

Mỗi câu có schema (xem `src/lib/types.ts`):

```ts
type Question = {
  id: number;                 // 1..600
  category: QuestionCategory; // 6 category, ràng buộc theo chương
  chapter: number;            // 1..6
  question: string;           // nội dung câu hỏi
  answers: string[];          // 2..6 đáp án
  correctAnswer: number;      // index trong answers
  explanation: string;        // có thể rỗng — đây là field anh phải fill
  explanationSource?: "official-capture" | "paper-note" | "source" | "ai-draft" | "manual";
  explanationReview?: "verified" | "needs-review";
  verifiedAgainst?: string;   // tên file ảnh đối chiếu, vd "IMG_42.png"
  memoryTip?: string;
  tipSource?: "paper-note" | "source" | "ai-draft" | "manual";
  critical: boolean;          // câu điểm liệt — KHÔNG được thay đổi
  image: string | null;
  sourceImage?: string;
};
```

Mapping chương ↔ id (đã cố định, validator sẽ fail nếu sai):

| Chương | ID range | Category |
|---|---|---|
| 1 | 1–180 | Quy định chung và quy tắc giao thông đường bộ |
| 2 | 181–205 | Văn hóa giao thông, đạo đức người lái xe, PCCC và cứu hộ cứu nạn |
| 3 | 206–263 | Kỹ thuật lái xe |
| 4 | 264–300 | Cấu tạo và sửa chữa |
| 5 | 301–485 | Báo hiệu đường bộ |
| 6 | 486–600 | Giải thế sa hình và kỹ năng xử lý tình huống giao thông |

Hiện trạng:
- 9/600 câu đã có `explanation`. **Không được ghi đè** các câu đã có `explanationSource: "official-capture"` + `explanationReview: "verified"`.
- 60 câu `critical: true` — danh sách cố định, không sửa.

## 2. Input — Ảnh chụp từ hệ thống học GPLX chính thức

Folder: `reference/official-captures/`. Có **139 file PNG** đặt tên `IMG_01.png` … `IMG_139.png`. Người dùng chụp trong nhiều phiên, có 2 layout chính, và có một số trường hợp đặc biệt anh phải xử lý cẩn thận.

### 2.1 Layout A — "Ôn luyện" (study mode, sidebar đầy đủ)

Đặc điểm nhận diện:
- Có sidebar trái: danh sách "Chương I", "Chương II", "Video chương 1"…
- Header trên cùng: "**Phần X. <tên phần>**" (Phần 1 = chương 1; Phần 3 = chương 6 sa hình; ánh xạ theo `category`)
- Tiêu đề giữa: "**Khái niệm và quy tắc giao thông đường bộ**" / "**Giải các thế sa hình**" / v.v.
- Bên phải có timer + ô **"Câu hỏi: N/M"** (số thứ tự trong phần, ví dụ `103/180`)
- Nội dung câu nằm trong card giữa: prompt, 3–4 đáp án radio, marker "✓ Chính xác" / "✗ Chưa chính xác", dòng "Câu trả lời chính xác là:", dòng "Phản hồi:" + nội dung giải thích.

### 2.2 Layout B — "Kiểm tra" (test/mock exam, sidebar tối giản)

Đặc điểm nhận diện:
- Sidebar bên phải hiển thị grid số câu (1, 2, 3, …) — đây là danh sách câu trong đề thi
- Có thể không có ô "Phản hồi:" (vài câu trong test mode không hiển thị giải thích)
- Vẫn có "✓ Chính xác" / "✗ Chưa chính xác" và "Câu trả lời chính xác là:"

### 2.3 Edge cases BẮT BUỘC xử lý đúng

1. **Câu người dùng làm SAI**: marker là "✗ Chưa chính xác" (đỏ). Đáp án người dùng chọn được tô đỏ, đáp án đúng được tô xanh hoặc đánh dấu khác. **Bắt buộc lấy `correctAnswer` từ dòng "Câu trả lời chính xác là: <số>-<text>"**, KHÔNG lấy từ option mà người dùng đã click.

2. **Banner câu điểm liệt**: ở layout A, một số câu có banner đỏ "⚠ Đây là câu điểm liệt" ngay dưới số câu. Đây là tín hiệu xác nhận câu đó `critical: true`. **KHÔNG được thay đổi field `critical`** — chỉ dùng để cross-validate với danh sách 60 critical IDs đã có sẵn trong validator (`scripts/validate-data.mjs`). Nếu phát hiện không khớp → log warning, không tự sửa.

3. **Ảnh trùng (duplicate captures)**: hệ thống random thứ tự nên cùng một câu có thể xuất hiện nhiều lần. Phải dedupe trước khi apply — nếu 2 ảnh map về cùng `questionId` với confidence cao, chỉ giữ ảnh nào có `explanation` dài hơn / rõ hơn.

4. **Số thứ tự hiển thị (vd "Câu hỏi: 103/180") KHÔNG phải `question.id`**. Hệ thống random — phải match bằng **nội dung câu hỏi**, không bằng số.

5. **Câu không có "Phản hồi:"**: vẫn extract được question + answers + correct. Apply explanation rỗng nhưng vẫn set `explanationSource: "official-capture"` + `explanationReview: "verified"` + `verifiedAgainst: "<file>"` để đánh dấu là đã đối chiếu xong (nội dung khớp), chỉ thiếu giải thích.

## 3. Output mong muốn

### 3.1 File chính cần sửa: `src/data/questions.json`

Với mỗi câu match được confidence ≥ 0.92 (xem mục 4):

```json
{
  "id": 47,
  // ... các field cũ giữ nguyên ...
  "explanation": "Nội dung từ ô 'Phản hồi:' của ảnh, normalize whitespace",
  "explanationSource": "official-capture",
  "explanationReview": "verified",
  "verifiedAgainst": "IMG_42.png"
}
```

**KHÔNG được sửa**: `id`, `category`, `chapter`, `question`, `answers`, `correctAnswer`, `critical`, `image`, `sourceImage`, `memoryTip`, `tipSource`.

Nếu OCR cho thấy `correctAnswer` từ ảnh KHÁC với trong JSON hiện tại → KHÔNG sửa JSON, ghi vào `reports/captures-conflicts.json` cho người dùng review thủ công.

### 3.2 Các report file (tạo mới folder `reports/`)

```
reports/captures-applied.json    — list (questionId, image, confidence, explanationLength)
reports/captures-uncertain.json  — 0.75 ≤ confidence < 0.92, cần review tay
reports/captures-unmatched.json  — confidence < 0.75 hoặc OCR fail
reports/captures-conflicts.json  — match nhưng correctAnswer / critical lệch
reports/captures-duplicates.json — nhiều ảnh map cùng questionId, đã dedupe
reports/ingest-summary.md        — báo cáo tổng cho người dùng đọc
```

Mỗi entry trong `applied.json` ví dụ:
```json
{
  "questionId": 47,
  "image": "IMG_42.png",
  "confidence": 0.96,
  "explanationLength": 124,
  "criticalMatchConfirmed": true
}
```

## 4. Pipeline & thuật toán

### 4.1 OCR
- Tesseract.js đã cài sẵn (`tesseract.js@^7`), file traineddata tiếng Việt nằm ở root: `vie.traineddata`.
- Hoặc Python `pytesseract` + `tesseract-ocr-vie`.
- Resolution 1000–1500px ngang là đủ. Nếu OCR yếu, scale 2x trước khi nhận dạng.

### 4.2 Extract field từ OCR text
Heuristic dựa trên anchor tiếng Việt — không dùng pixel coordinate vì 2 layout khác nhau:

- **Question text**: đoạn text dài đầu tiên kết thúc bằng `?`
- **Answers**: các dòng bắt đầu bằng `1-`, `2-`, `3-`, `4-` (hoặc `A.`, `B.`, `C.`, `D.`)
- **Correct answer**: dòng sau `"Câu trả lời chính xác là:"` — parse `<số>-<text>`, số là 1-based, convert sang 0-based khi compare
- **Explanation**: đoạn text sau `"Phản hồi:"` đến hết card (trước "Trước" / "Tiếp" button)
- **Critical banner**: regex `Đây là câu điểm liệt` (case-insensitive, accent-insensitive)
- **Wrong answer marker**: regex `Chưa chính xác` hoặc `Chưa cl?[ií]nh x[áa]c`

### 4.3 Fuzzy match question → questions.json

1. Normalize cả 2 phía: lowercase, remove diacritics, remove punctuation, collapse whitespace
2. Tính similarity bằng:
   - **Levenshtein ratio** trên normalized question text → score_q
   - **Token-set ratio** trên normalized correct answer text → score_a
   - **Final confidence** = `0.7 * score_q + 0.3 * score_a`
3. Threshold:
   - ≥ 0.92 → auto-apply
   - 0.75–0.92 → uncertain, queue lại
   - < 0.75 → reject

### 4.4 Dedupe
- Sau khi tất cả ảnh đã được map → group theo `questionId`
- Trong mỗi group: chọn ảnh có explanation dài nhất + confidence cao nhất
- Các ảnh còn lại → `captures-duplicates.json`

### 4.5 Conflict resolution
Một câu chỉ apply 1 lần. Nếu:
- `correctAnswer` từ ảnh ≠ JSON → **không apply**, ghi conflict
- `critical` từ banner ≠ JSON → **không tự sửa critical**, ghi conflict
- Câu trong JSON đã có `explanationSource: "official-capture" + verified` → **giữ nguyên**, ghi vào `captures-duplicates.json` với note "already verified"

## 5. Resources có sẵn trong repo

- `src/data/questions.json` — bộ 600 câu (source of truth)
- `src/lib/types.ts` — schema TypeScript
- `scripts/validate-data.mjs` — validator chạy được bằng `npm run validate:data`
- `docs/capture-todo.json` — danh sách câu được priority cao (Tier A/B/C)
- `docs/capture-todo.md` — version markdown
- `vie.traineddata` — Tesseract Vietnamese model ở root repo
- `scripts/ocr-gplx-questions.mjs` — đã có sẵn một script OCR baseline (đọc trước để tham khảo, có thể reuse hoặc viết lại)
- `package.json` — đã có `tesseract.js`, `zod` trong devDependencies

## 6. Implementation suggestions

Đề xuất tạo 1 script duy nhất `scripts/ingest-captures.mjs`:

```text
node scripts/ingest-captures.mjs [--dry-run] [--threshold=0.92]
```

Flow:
1. Đọc `src/data/questions.json` → build normalized lookup
2. List tất cả PNG trong `reference/official-captures/`
3. Với mỗi ảnh: OCR → extract → match → grade
4. Group + dedupe theo questionId
5. Apply lên JSON (chỉ khi không có `--dry-run`)
6. Ghi 5 report files vào `reports/`
7. In summary ra console

Sau khi chạy:
- Chạy `npm run validate:data` để verify không phá schema
- Chạy `npm run test` để verify exam logic vẫn pass
- Báo lại stats: bao nhiêu applied / uncertain / unmatched / conflict / duplicate

## 7. QA checklist (agent BẮT BUỘC làm trước khi commit)

- [ ] `npm run validate:data` exit 0
- [ ] Tổng số câu vẫn 600, không thêm/bớt câu nào
- [ ] Không có câu nào bị thay đổi `id`, `chapter`, `category`, `correctAnswer`, `critical`, `question`, `answers`
- [ ] Mọi câu được apply có đủ 4 field: `explanation`, `explanationSource: "official-capture"`, `explanationReview: "verified"`, `verifiedAgainst: "<file.png>"`
- [ ] Không có câu nào trong `applied.json` mà đồng thời có trong `conflicts.json`
- [ ] `reports/ingest-summary.md` có thống kê rõ: total images, applied, uncertain, unmatched, conflicts, duplicates, critical-banners-confirmed, critical-banners-mismatch

## 8. Báo cáo cuối

Sau khi chạy xong, in ra console + ghi vào `reports/ingest-summary.md`:

```
=== INGEST SUMMARY ===
Tổng ảnh:               139
Đã apply (≥0.92):       N    → N câu trong questions.json được fill
Cần review (0.75-0.92): N
Unmatched (<0.75):      N
Conflict (correct≠):    N
Duplicate:              N

Critical banner confirm:   N câu critical:true có banner trong ảnh
Critical banner mismatch:  N câu (banner trong ảnh ≠ critical:false) — cần đối chiếu

Câu có explanation sau ingest: từ 9 → N (tăng +K)
```

## 9. Lưu ý đặc biệt

- **Người dùng chỉ chụp một phần**, không phải đủ 600. Bỏ qua việc cố tìm cho mọi câu — chỉ xử lý ảnh đã có.
- **Hệ thống chính thức random thứ tự**, số thứ tự hiển thị KHÔNG phải `question.id`.
- **Không tạo file output ngoài 7 đường dẫn liệt kê ở mục 3** (questions.json + reports/*).
- **Nếu Tesseract OCR cho kết quả rác** trên nhiều ảnh liên tiếp → dừng lại, log lỗi, đừng apply gì cả.
- **Encoding**: questions.json là UTF-8, giữ nguyên dấu tiếng Việt khi ghi. Indent 2 spaces, không có trailing newline khác với hiện tại (đọc trước để mimic format).

Sẵn sàng. Bắt đầu.
