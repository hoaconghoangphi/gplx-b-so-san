# Handoff Prompt v3 — Ingest captures (top crop + OCR char-sub + tiebreaker)

> Supersede `docs/ingest-prompt-v2.md`.
> v2 đã chạy thành công (127/140 applied) nhưng còn 14 unmatched + 2 conflict cần giải.
> v3 thêm 3 cải tiến + áp dụng 2 fix thủ công của user.
> Self-contained — đưa cho agent AI thực thi.

---

## 1. Bối cảnh dự án

Repo: `gplx-b-so-san` — Next.js app học GPLX hạng B, 600 câu ở `src/data/questions.json`.

Schema, mapping chương ↔ id, ràng buộc về field không được sửa (`id`, `category`, `chapter`, `question`, `answers`, `correctAnswer`, `critical`, `image`, `sourceImage`, `memoryTip`, `tipSource`) — y như v2. Tham khảo `src/lib/types.ts` nếu cần.

**Ngoại lệ v3:** mục 3.1 dưới đây cho phép sửa **1 trường hợp duy nhất** `correctAnswer` của q527 (do user xác nhận thủ công đáp án trong JSON sai).

## 2. Trạng thái sau v2

- `src/data/questions.json` valid, 600 câu, 127 câu có `explanationSource: "official-capture" + verified`.
- `reports/captures-*.json` v2 — agent được phép overwrite.
- `reference/official-captures/` — 139 ảnh PNG (không đổi so với v2).

## 3. Pre-flight fixes (LÀM TRƯỚC khi re-run ingest)

### 3.1 Sửa correctAnswer q527

User xác nhận đáp án đúng là vị trí 0 (option "1-Xe con (E), xe mô tô (C).") theo capture `IMG_10.png`. JSON hiện đang `"correctAnswer": 2` — SAI. Sửa thành `0`.

```diff
   "id": 527,
   ...
-  "correctAnswer": 2,
+  "correctAnswer": 0,
```

Sau khi sửa: chạy `npm run validate:data` để chắc validator không phàn nàn (validator chỉ check `correctAnswer < answers.length`, không check giá trị nghiệp vụ — sẽ pass).

### 3.2 KHÔNG sửa critical q107 / q165

⚠️ **q107 và q165 có question text TRÙNG NHAU 100% nhưng answers khác nhau.**

```
q107.question = q165.question = "Người điều khiển phương tiện tham gia giao thông đường bộ phải quan sát, giảm tốc độ hoặc dừng lại để bảo đảm an toàn trong các trường hợp nào dưới đây?"
```

- q107 answers: báo hiệu cảnh báo nguy hiểm / cầu cống hẹp / điểm dừng xe → `critical: false`
- q165 answers: vạch kẻ người đi bộ / đường giao nhau / khu vực trường học → `critical: true` (nằm trong 60 critical IDs)

v2 đã match `IMG_91.png` vào q107 với confidence 1.0 (vì match chỉ trên question text), nhưng theo banner "Đây là câu điểm liệt" trong ảnh thì capture thực ra là q165. **Không sửa flag critical** — mục 4.5 dưới đây sẽ fix match algorithm để IMG_91 tự động map vào q165.

## 4. Pipeline v3

Kế thừa v2 mục 3.1–3.4 (2 layout, edge cases), mục 4.1 (crop sidebar 22%), mục 4.2 (OCR tesseract), mục 4.3 (split anchor `(?:✓\s*)?\d+\.\s*Câu hỏi chọn một đáp án`), mục 4.4 (extract), mục 4.5 (clean OCR noise), mục 4.7 (dedupe + apply), mục 4.8 (conflict). 4 thay đổi mới:

### 4.1 ⚠️ MỚI: Top header crop (cho layout "Kiểm tra")

Layout "Kiểm tra" có **header ngang ở đỉnh** chứa text như:
```
Hạn cuối hoàn thành: hết ngày 01/06/2026  Q} Điểm và tiến độ
```
Crop sidebar 22% không xử lý vì header này nằm ngang ở top.

**Cách detect:** Sau khi crop sidebar, OCR thử ~10% chiều cao đầu của ảnh đã crop. Nếu match regex `/Hạn cuối|hoàn thành|Điểm và tiến độ/i` → đây là layout có top header.

**Cách xử lý:** Crop bỏ thêm vùng `[0, 0, width, height*0.08]` (8% từ top). Sau đó OCR lại phần còn lại.

Có thể detect+crop trong 1 lần: chỉ cần check pixel đầu tiên của top ~80px có phải vùng header trắng/xám có text "Hạn cuối" không. Nếu có → crop, nếu không → giữ nguyên.

### 4.2 ⚠️ MỚI: OCR char-substitution normalize trong fuzzy match

OCR hay đọc nhầm digit ↔ chữ cái Latin. Trong v2, IMG_60/IMG_90/IMG_93 fail match vì OCR đọc `60 km/h` thành `óO km/h`.

Trong bước **normalize** (lúc tính Levenshtein) phải thêm substitution:

```
ó → o → 0
Ó → 0
O → 0
o → 0
ố → 0  (less common)
l → 1
I → 1
| → 1
g → 9 (only at end-of-token)
```

**Cẩn thận:** chỉ apply substitution trong context "kế bên digit khác" hoặc "trong cụm như Xkm/h, Xm., Xtuổi" — để không phá từ tiếng Việt thường.

Cách đơn giản hơn: trong normalize cho fuzzy match (KHÔNG cho explanation/answer text lưu vào JSON), tạo 2 phiên bản của text:
- `text_normal`: lowercase + remove diacritics + remove punctuation
- `text_digit_aggressive`: như trên + apply substitutions `o→0, l→1, i→1`

Tính score trên cả 2, lấy max. Substitution chỉ dùng để **so sánh**, không thay đổi text gốc.

### 4.3 ⚠️ MỚI: Empty segment skip

Multi-câu image đôi khi có segment 1 hoặc 2 chỉ là banner anchor không có content (ảnh bị cắt cuối). v2 log 4 trường hợp như vậy thành unmatched.

**Fix:** với segment có `segmentIndex > 0` mà extracted question text < 30 ký tự HOẶC không có answer → silent skip, không log vào unmatched. Vẫn count trong summary là "empty segments skipped: N".

### 4.4 ⚠️ MỚI: Match scoring + tiebreaker

Đổi công thức `0.7*score_q + 0.3*score_correct_answer` (v2) thành công thức 2 tầng:

**Tầng 1 — Find top candidates:**
Tính `score_q` (Levenshtein ratio normalized question). Lấy tất cả candidate có `score_q ≥ 0.85`.

**Tầng 2 — Tiebreak by full answer set:**
Với mỗi candidate, tính `score_a_full`:
- So tập answers của capture (4 phần tử) với tập answers của candidate question
- Pair matching greedy: với mỗi capture answer, tìm candidate answer tốt nhất (token-set ratio), không reuse
- `score_a_full` = trung bình các pair score

**Final confidence:** `0.5*score_q + 0.5*score_a_full`

Chọn candidate có final confidence cao nhất. Threshold giữ nguyên: ≥0.92 apply / 0.75–0.92 uncertain / <0.75 reject.

**Expected outcome cho IMG_91:**
- q107: score_q=1.0, score_a_full thấp (answers khác) → final ~0.55–0.65
- q165: score_q=1.0, score_a_full cao (answers đúng) → final ~0.95+

→ IMG_91 sẽ tự động map vào q165.

## 5. Re-run + Output

Re-run toàn bộ 139 ảnh, overwrite `src/data/questions.json` + `reports/captures-*.json`.

**Cleanup quan trọng:** trước khi apply v3, **revert** field explanation/source/review/verifiedAgainst của q107 nếu nó đang đứng tên `IMG_91.png`. Vì agent v3 sẽ apply IMG_91 vào q165 thay vì q107. Nếu q107 không có capture khác match → trả về `explanation: ""`, xoá `explanationSource`, `explanationReview`, `verifiedAgainst`.

Nói chung **luôn rebuild from scratch**: với mỗi câu có `explanationSource: "official-capture"` trong JSON hiện tại, clear 4 field đó trước khi chạy match → tránh leftover từ v2.

**KHÔNG clear** câu có `explanationSource` khác (`paper-note`, `source`, `manual`, `ai-draft`).

## 6. Chống corrupt JSON (giữ y v2)

1. Đọc full file → parse → modify in memory → `JSON.stringify` → `fs.writeFileSync` 1 lần.
2. Re-read + re-parse sau khi ghi. Length phải === 600. Nếu fail → `git checkout HEAD -- src/data/questions.json`, retry 1 lần. Vẫn fail → STOP, báo lỗi.
3. UTF-8, indent 2 spaces, kết thúc bằng `\n`.

## 7. QA checklist (BẮT BUỘC)

- [ ] `npm run validate:data` exit 0
- [ ] File `src/data/questions.json` parse được, 600 câu
- [ ] **q527 có `correctAnswer: 0`** (đã sửa ở mục 3.1)
- [ ] **q165 có explanation từ `IMG_91.png`** (verifiedAgainst="IMG_91.png")
- [ ] **q107 KHÔNG có explanation từ IMG_91.png** (hoặc trống nếu không có capture khác)
- [ ] Applied count ≥ v2 (127). Mục tiêu 135+.
- [ ] Unmatched count < v2 (14). Mục tiêu < 8.
- [ ] Sample 5 câu chương 1 (id 60, 90, 93 nếu match): explanation chứa từ "km/h" hoặc số liệu hợp lệ
- [ ] `reports/ingest-summary.md` v3 có stats đầy đủ

## 8. Báo cáo cuối

```
=== INGEST SUMMARY (v3) ===
Tổng ảnh:                   139
Segments tổng:              N
Empty segments skipped:     N   (mới v3)
1-câu ảnh:                  N
Multi-câu ảnh:              N

Applied (≥0.92):            N   (v2: 127)
  + cleaned OCR noise:      N
  + matched by full-answer: N   (mới v3, tiebreaker active)
Uncertain (0.75-0.92):      N
Unmatched (<0.75):          N   (v2: 14)
Conflict:                   N   (v2: 2 → mục tiêu 0)
Duplicate:                  N

Critical banner confirm:    N
Critical banner mismatch:   N   (mục tiêu 0)

Pre-flight fixes applied:
  - q527 correctAnswer 2→0
  - q107 cleared (IMG_91 remapped to q165)

Câu có explanation:         9 → N
So với v2 (129):            +N
```

## 9. Lưu ý

- Re-run sạch: clear field official-capture trước khi match, rồi mới apply theo v3 logic.
- Không touch các field bảo vệ ngoài exception q527 correctAnswer ở mục 3.1.
- Encoding UTF-8, indent 2 spaces.
- File `scripts/ingest-captures.mjs` đã có từ v2 — overwrite nếu cần.

Sẵn sàng. Bắt đầu.
