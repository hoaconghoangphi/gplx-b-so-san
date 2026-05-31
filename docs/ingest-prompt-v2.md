# Handoff Prompt v2 — Ingest official captures (multi-question + sạch OCR)

> Đây là phiên bản v2, supersede `docs/ingest-prompt.md`.
> v1 đã chạy thành công nhưng có 3 vấn đề: OCR noise nhiều, sidebar bleed, chưa hỗ trợ ảnh 2-câu.
> Prompt này yêu cầu **re-OCR toàn bộ** + **overwrite** kết quả v1.
> Đưa toàn bộ nội dung file này cho agent AI. Đã self-contained.

---

## 1. Bối cảnh dự án

Repo: `gplx-b-so-san` — Next.js 16 / React 19 / TypeScript / Tailwind v4 app học và thi thử lý thuyết GPLX ô tô hạng B số sàn. Bộ câu hỏi 600 câu ở `src/data/questions.json`.

Schema (xem `src/lib/types.ts`):

```ts
type Question = {
  id: number;                 // 1..600
  category: QuestionCategory; // 6 category cố định theo chương
  chapter: number;            // 1..6
  question: string;
  answers: string[];
  correctAnswer: number;
  explanation: string;        // field anh fill
  explanationSource?: "official-capture" | "paper-note" | "source" | "ai-draft" | "manual";
  explanationReview?: "verified" | "needs-review";
  verifiedAgainst?: string;   // tên file ảnh
  memoryTip?: string;
  tipSource?: "paper-note" | "source" | "ai-draft" | "manual";
  critical: boolean;          // CỐ ĐỊNH, không sửa
  image: string | null;
  sourceImage?: string;
};
```

Mapping chương ↔ id:

| Chương | ID range | Category |
|---|---|---|
| 1 | 1–180 | Quy định chung và quy tắc giao thông đường bộ |
| 2 | 181–205 | Văn hóa giao thông, đạo đức người lái xe, PCCC và cứu hộ cứu nạn |
| 3 | 206–263 | Kỹ thuật lái xe |
| 4 | 264–300 | Cấu tạo và sửa chữa |
| 5 | 301–485 | Báo hiệu đường bộ |
| 6 | 486–600 | Giải thế sa hình và kỹ năng xử lý tình huống giao thông |

## 2. Trạng thái hiện tại (sau khi v1 đã chạy)

- `src/data/questions.json`: 99 câu đã có `explanationSource: "official-capture"` + `explanationReview: "verified"` từ v1. **Nhưng** explanation có OCR noise (trailing rác, sidebar bleed).
- `reports/captures-*.json`: kết quả v1 — anh sẽ overwrite.
- `reference/official-captures/`: 139 ảnh PNG (`IMG_01.png` … `IMG_139.png`).
- 60 câu critical IDs cố định trong `scripts/validate-data.mjs` — không sửa.

**Anh được phép overwrite explanation v1 (vì v1 có noise).** Re-OCR sạch hơn → ghi đè.
**KHÔNG ghi đè** các câu có `explanationSource` khác `"official-capture"` (vd `"paper-note"`, `"manual"`).

## 3. Input — Ảnh chụp

Folder: `reference/official-captures/`. 139 PNG. Có 2 layout + 2 trường hợp đặc biệt mới.

### 3.1 Layout A — "Ôn luyện"
Sidebar trái rộng chứa danh sách chương ("Chương I", "P1 - C1", v.v.). Sidebar trải dài khoảng **22% chiều ngang ảnh từ mép trái**. Bên phải có ô "Câu hỏi: N/M" + timer.

### 3.2 Layout B — "Kiểm tra"
Sidebar trái tương tự nhưng đôi khi có grid số câu thay vì timer. Cùng tỷ lệ sidebar ~22%.

### 3.3 ⚠️ MỚI: Ảnh nhiều câu trong 1 file
Một ảnh có thể chứa **2 hoặc 3 câu** nối tiếp theo chiều dọc. Cách nhận diện:

- Đếm số lần xuất hiện anchor regex `(?:✓\s*)?\d+\.\s*Câu hỏi chọn một đáp án` trong OCR output.
- Anchor xuất hiện N lần → ảnh có N câu.
- Mỗi banner là 1 dòng xám nhạt nằm ngang với prefix `✓ <số>. Câu hỏi chọn một đáp án`.

Sau khi tách, mỗi segment xử lý độc lập như 1 câu riêng.

### 3.4 Edge cases bắt buộc xử lý (giữ y v1)

1. **Câu user làm SAI** (marker `✗ Chưa chính xác` đỏ): lấy correctAnswer từ dòng "Câu trả lời chính xác là:", KHÔNG từ chỗ user click.
2. **Banner "Đây là câu điểm liệt"**: dùng cross-validate với 60 critical IDs trong validator. KHÔNG sửa field `critical`.
3. **Duplicate**: cùng câu trên nhiều ảnh → giữ ảnh có explanation dài+sạch nhất.
4. **Số "Câu hỏi: 103/180" trên ảnh** ≠ `question.id`. Match bằng nội dung text.
5. **Không có "Phản hồi:"**: explanation rỗng, vẫn đánh `verified` (content đã đối chiếu).

## 4. Pipeline mới — phải làm đúng theo thứ tự

### 4.1 Crop sidebar trước OCR (BẮT BUỘC)

Với mỗi ảnh:
1. Đọc width của ảnh
2. Crop bỏ vùng `[0, 0, width*0.22, height]` (22% từ mép trái)
3. OCR phần còn lại

Lý do: sidebar trái chứa "Chương I", "P1-C1-1", "Phần X. ...", "Video chương N", … bleed vào question text và phá fuzzy match. v1 fail 28 ảnh chủ yếu vì cái này.

Có thể dùng `sharp` (cài qua npm) hoặc Python PIL để crop. Nếu không có thư viện, tự đọc width từ PNG header và pass crop region cho Tesseract qua `--rect` parameter (Tesseract CLI hỗ trợ rect, hoặc dùng `sharp().extract()`).

### 4.2 OCR

- `tesseract.js@^7` đã cài. `vie.traineddata` ở root repo.
- Hoặc Python `pytesseract` + `tesseract-ocr-vie`.
- Nếu OCR yếu, upscale 2x trước.

### 4.3 Split thành các segment câu

Trên text đã OCR (sau crop sidebar):
1. Tìm tất cả vị trí match regex anchor: `/(?:✓\s*)?\d+\.\s*C[âa]u\s+h[ỏo]i\s+ch[ọo]n\s+m[ộo]t\s+đ[áa]p\s+[áa]n/gi` (linh động cho OCR sai dấu).
2. Mỗi vị trí anchor → bắt đầu 1 segment.
3. Segment kết thúc ở anchor kế tiếp HOẶC hết text.
4. Nếu không tìm thấy anchor nào → coi cả ảnh là 1 segment (legacy 1-câu).

### 4.4 Extract field cho mỗi segment

Heuristic anchor tiếng Việt:

- **Question text**: đoạn dài đầu tiên sau anchor (hoặc đầu segment), kết thúc bằng `?`.
- **Answers**: dòng bắt đầu bằng `1-`, `2-`, `3-`, `4-` HOẶC `A.`, `B.`, `C.`, `D.`.
- **Correct answer**: dòng SAU `"Câu trả lời chính xác là:"` → parse `<số>-<text>`, số 1-based → 0-based.
- **Explanation raw**: text SAU `"Phản hồi:"` đến hết segment.
- **Critical banner**: regex `Đây là câu điểm liệt` (lỏng dấu).
- **Wrong marker**: regex `Chưa chính xác`.

### 4.5 ⚠️ MỚI: Clean OCR noise trong explanation (BẮT BUỘC)

Sau khi extract raw explanation, làm sạch:

1. **Cắt sau câu hoàn chỉnh cuối cùng**: tìm vị trí cuối cùng của `[.!?]` rồi `\s+` rồi 1 chữ Việt thường (a-z, à, á, â, …) → đó là kết thúc câu hợp lệ. Cắt sau dấu chấm cuối cùng.

2. **Strip nav button bleed**: regex remove các pattern cuối chuỗi:
   - `\b(Trước|Tiếp|Mục trước|Tiếp theo|Kiểm tra|Trang thái)\b.*$`
   - `[+\-\*]+\s*$` (ký tự lẻ cuối)

3. **Strip OCR garbage tokens**: nếu sau dấu chấm cuối có chuỗi < 50 ký tự gồm chủ yếu ký tự không phải chữ cái Việt (`[^a-zàáâãäåèéêëìíîïòóôõöùúûüýÿđa-zA-Z0-9\s,.;:()\-]+`) → cắt bỏ.

4. **Sidebar word bleed cleanup**: nếu trong explanation có chuỗi match `(Phần|Chương|Video chương|P\d+\s*-\s*C\d+)` → cắt từ đó về sau (rồi áp dụng lại bước 1 để cắt sạch sau dấu chấm cuối hợp lệ trước đó).

5. **Collapse whitespace**: `\s+` → ` ` (1 space).

6. **Reject if** explanation sau clean < 10 ký tự HOẶC không có ký tự chữ cái Việt → coi như rỗng explanation, vẫn apply `verified` (đã đối chiếu được).

Ví dụ trước/sau:

```
Trước: "Đường có giải phân cách được xem là đường đôi. Ñ Ngoài khu vực dân cư; đường đôi... 90km/h. Trước t) +"
Sau:   "Đường có giải phân cách được xem là đường đôi. Ngoài khu vực dân cư; đường đôi... 90km/h."
```

```
Trước: "Xe cơ giới không có xe đạp. g 9 \"P 2óm 3s t) +"
Sau:   "Xe cơ giới không có xe đạp."
```

### 4.6 Fuzzy match question → questions.json

Giữ y v1:
1. Normalize: lowercase, remove diacritics, remove punctuation, collapse whitespace.
2. Levenshtein ratio trên normalized question → score_q.
3. Token-set ratio trên normalized correct answer text → score_a.
4. `confidence = 0.7*score_q + 0.3*score_a`.
5. Threshold: ≥0.92 auto-apply / 0.75–0.92 uncertain / <0.75 reject.

### 4.7 Dedupe + Apply

- Group theo questionId sau khi match.
- Trong group: giữ entry có explanation dài nhất + confidence cao nhất. Others → duplicates report.
- Apply lên `src/data/questions.json`:
  - Set `explanation`, `explanationSource: "official-capture"`, `explanationReview: "verified"`, `verifiedAgainst: "<file.png>"`.
  - Ghi đè explanation v1 cũ nếu source đã là `"official-capture"`.
  - **KHÔNG ghi đè** nếu source hiện tại là `"paper-note"` / `"manual"` / `"source"`.

### 4.8 Conflict (giữ y v1)

- `correctAnswer` ảnh ≠ JSON → không apply, ghi conflicts.
- `critical` banner ≠ JSON → không sửa critical, ghi conflicts.

## 5. Output

### 5.1 File chính: `src/data/questions.json`
Chỉ touch 4 field: `explanation`, `explanationSource`, `explanationReview`, `verifiedAgainst`. KHÔNG sửa: `id`, `category`, `chapter`, `question`, `answers`, `correctAnswer`, `critical`, `image`, `sourceImage`, `memoryTip`, `tipSource`.

### 5.2 Reports — OVERWRITE folder `reports/`
```
reports/captures-applied.json    — (questionId, image, segmentIndex, confidence, explanationLength, wasCleaned)
reports/captures-uncertain.json
reports/captures-unmatched.json
reports/captures-conflicts.json
reports/captures-duplicates.json
reports/ingest-summary.md
```

`segmentIndex` (mới): 0 nếu ảnh 1-câu, 0/1/2/… nếu ảnh nhiều câu.
`wasCleaned: boolean` (mới): có áp dụng OCR noise cleanup không.

## 6. ⚠️ CỰC KỲ QUAN TRỌNG: chống corrupt JSON

v1 đã bị truncate file `src/data/questions.json` lúc ghi (file kết thúc giữa câu 562). Lần này:

1. Đọc toàn bộ file → parse → modify object trong memory → JSON.stringify → ghi file bằng `fs.writeFileSync(path, content, "utf8")` 1 phát.
2. **KIỂM TRA SAU KHI GHI**: re-read file vừa ghi, `JSON.parse` lại, đảm bảo length === 600 và không có exception. Nếu fail → restore từ git: `git checkout HEAD -- src/data/questions.json` rồi thử lại 1 lần. Nếu vẫn fail → STOP, không apply gì, báo lỗi.
3. Indent 2 spaces, UTF-8, giữ format giống file gốc (kết thúc bằng `\n`).

## 7. Implementation

Re-implement `scripts/ingest-captures.mjs` (overwrite file v1). Có thể tham khảo logic v1 hiện có nhưng phải bổ sung 3 thứ:
- Crop sidebar 22% trước OCR
- Detect & split multi-question
- Clean OCR noise cleanup

```text
node scripts/ingest-captures.mjs [--dry-run] [--threshold=0.92]
```

## 8. QA checklist (BẮT BUỘC pass trước khi commit)

- [ ] `npm run validate:data` exit 0
- [ ] File `src/data/questions.json` parse được, có đúng 600 câu
- [ ] Không có câu nào thay đổi `id`, `chapter`, `category`, `question`, `answers`, `correctAnswer`, `critical`
- [ ] Không có câu nào trong applied đồng thời có trong conflicts
- [ ] Sample 5 câu applied: explanation không có trailing `Trước`, `Tiếp`, `+`, `Ñ`, hoặc tokens lẻ < 3 ký tự cuối câu
- [ ] Sample 5 câu applied: explanation không chứa `"Chương I"`, `"Phần "`, `"P1-C"`, `"Video chương"`
- [ ] `reports/ingest-summary.md` có đầy đủ stats + so sánh trước/sau v1

## 9. Báo cáo cuối

In console + ghi `reports/ingest-summary.md`:

```
=== INGEST SUMMARY (v2) ===
Tổng ảnh:                  139
Segments (sau split):      N
1-câu ảnh:                 N
Multi-câu ảnh:             N

Applied (≥0.92):           N
  + đã clean OCR noise:    N
Uncertain (0.75-0.92):     N
Unmatched (<0.75):         N
Conflict:                  N
Duplicate:                 N

Critical banner confirm:   N
Critical banner mismatch:  N

Câu có explanation:        9 → N
So với v1 (84):            +/- N
```

## 10. Lưu ý

- v1 đã viết `scripts/ingest-captures.mjs` — anh được phép overwrite hoàn toàn.
- Không tạo file ngoài 7 đường dẫn ở mục 5.
- Nếu cần thư viện crop ảnh, dùng `sharp` (`npm i sharp --save-dev` — đã có trong deps gián tiếp qua Next nhưng cứ install explicit để chắc).
- Encoding UTF-8, giữ dấu tiếng Việt.

Sẵn sàng. Bắt đầu.
