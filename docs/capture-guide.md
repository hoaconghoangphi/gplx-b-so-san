# Capture Guide — Cách chụp câu hỏi từ hệ thống chính thức

Mục tiêu: chụp đủ thông tin để AI tự match vào `questions.json` mà bạn tốn ít công nhất.

## 1. Câu nào cần chụp?

Mở `docs/capture-todo.md`. File này được sinh tự động bởi `npm run build:capture-todo` và chia 3 tier:

- **Tier A — Điểm liệt** (~60 câu): sai 1 câu là trượt thi. Chụp **toàn bộ**.
- **Tier B — Câu có số liệu**: tốc độ, khoảng cách, niên hạn, mức phạt, tuổi, nồng độ cồn… Chụp **càng nhiều càng tốt**.
- **Tier C — Sa hình phức tạp**: câu chương 6 có hình nhiều xe. Chụp khi tiện.

Câu đã có `explanationSource: official-capture` + `verified` sẽ tự động bị loại khỏi list, không cần chụp lại.

## 2. Chụp gì trong 1 ảnh?

Chụp full khung câu hỏi, bao gồm đủ các phần sau cho **mỗi câu**:

1. **Toàn bộ câu hỏi** (chữ rõ, không bị crop)
2. **Tất cả đáp án** A / B / C / D (1, 2, 3, 4 cũng được)
3. **Đáp án đúng được highlight** (xanh / dấu ✓)
4. **Phần "Câu trả lời chính xác là:"** + **"Phản hồi:"** (giải thích) — phần quan trọng nhất
5. **Banner đỏ "Đây là câu điểm liệt"** nếu có

### 2a. Chụp 1 câu / 1 ảnh — mặc định

Chụp đến hết phần Phản hồi của 1 câu. Bỏ qua phần câu tiếp theo nếu thấy.

### 2b. Chụp 2 câu / 1 ảnh — chấp nhận được, tiết kiệm thời gian

Nếu hệ thống render 2 câu liên tiếp trong cùng 1 view, bạn có thể chụp gộp cả 2. Yêu cầu duy nhất: trong ảnh phải nhìn rõ **banner xám separator** dạng:

```
✓ N. Câu hỏi chọn một đáp án
```

Banner này là dấu hiệu agent dùng để tách 2 câu. Cứ chụp full vùng nội dung từ trên xuống, đảm bảo:

- Câu 1: đủ question + đáp án + ✓ Chính xác + Câu trả lời chính xác là + Phản hồi
- **Banner separator** nằm giữa
- Câu 2: cũng đủ như trên

Có thể chụp 3-4 câu/ảnh nếu cùng view, miễn nhìn rõ separator giữa các câu.

### 2c. Giải thích dài phải scroll

Chụp 2 ảnh, đặt cùng prefix với suffix `a`, `b` (xem mục 4).

## 3. Định dạng & chất lượng

- **PNG hoặc JPG** đều được.
- **Chiều ngang tối thiểu ~1000px** để OCR tiếng Việt đọc được. Screenshot cả màn hình laptop là dư.
- **Không cần crop**, không cần xoay, không cần annotate. AI sẽ tự cắt theo nội dung.
- Tránh nghiêng / mờ / che chữ. Nếu hệ thống có popup đè lên giải thích, đóng popup trước khi chụp.

## 4. Naming convention

**Không cần đặt tên theo số câu của hệ thống chính thức** — vì hệ thống random thứ tự, số đó vô nghĩa với app này.

Cứ đặt tên kiểu counter đơn giản:

```
IMG_001.png
IMG_002.png
IMG_003.png
...
```

Nếu 1 câu phải scroll → đặt suffix `a`, `b`:

```
IMG_042a.png   ← phần câu hỏi + đáp án
IMG_042b.png   ← phần giải thích
```

Agent sẽ tự gộp khi prefix giống nhau.

> Mẹo: trên Windows dùng `Snipping Tool` → `Window snip` để chụp cả cửa sổ trình duyệt. Mac dùng `Cmd+Shift+4` rồi `Space` rồi click vào cửa sổ.

## 5. Để file ở đâu?

Bỏ tất cả ảnh vào folder:

```
reference/official-captures/
```

Folder này đã có sẵn (rỗng). Sau khi chụp xong 1 batch, chạy:

```bash
npm run ingest:captures
```

(Script này sẽ có ở bước tiếp theo của plan — chưa viết.)

Script sẽ:

1. OCR từng ảnh bằng `tesseract.js` + `vie.traineddata`
2. Match nội dung câu hỏi OCR được với 600 câu trong `questions.json` bằng fuzzy match
3. Auto-apply explanation khi confidence ≥ 92%
4. Báo cáo các câu match yếu để bạn xác nhận thủ công

## 6. Quy trình đề xuất

1. Mở `docs/capture-todo.md`, in ra hoặc mở song song cửa sổ.
2. Vào hệ thống chính thức, chọn Tier A (điểm liệt) trước.
3. Mỗi câu xuất hiện, đối chiếu nội dung với checklist (vì thứ tự random).
4. Nếu trùng câu trong checklist → chụp full màn hình → đánh dấu `[x]` trong file.
5. Hết Tier A → push batch vào `reference/official-captures/` → chạy ingest script.
6. Lặp lại cho Tier B, Tier C.

## 7. Không cần chụp nếu

- Câu đã có `explanationSource: official-capture` (script đã tự loại).
- Câu trong Tier C nhưng hình đơn giản (1–2 xe), bạn có thể bỏ qua.
- Câu lý thuyết khái niệm chương 1–4 không nằm trong Tier A/B — không cần chụp, sẽ dùng PDF tài liệu giấy.
