# Phase 4 — UX improvements plan

Hai vấn đề user phát hiện sau Vercel test:

1. **Image phình ra** ở chương 5 (biển báo đơn/đôi) và chương 6 (sa hình giãn) → đẩy đáp án xuống dưới fold → user phải scroll mới chọn được.
2. **Thiếu keyboard shortcuts** → chọn đáp án + chuyển câu chậm, đặc biệt khi luyện đề.

---

## Issue 1 — Cố định image container

### Diagnosis

`src/components/QuestionCard.tsx` line 67–69:

```tsx
<div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
  <Image src={question.image} alt={...} width={960} height={540}
         className="h-auto w-full object-contain" unoptimized />
</div>
```

`w-full h-auto` = ảnh full width, height auto theo aspect ratio. Biển báo đơn portrait → cao gấp 1.5x width của container → đẩy đáp án xa.

### Fix proposal

Cố định chiều cao container ~320px (khoảng max-h-80 trong Tailwind), `object-contain` để fit cả portrait lẫn landscape không méo.

```tsx
{question.image ? (
  <div className="flex h-72 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 sm:h-80">
    <Image
      src={question.image}
      alt={`Hình minh họa câu ${question.id}`}
      width={960}
      height={540}
      className="max-h-full max-w-full w-auto h-auto object-contain"
      unoptimized
    />
  </div>
) : null}
```

Thay đổi cụ thể:
- Container: thêm `flex h-72 sm:h-80 items-center justify-center` → fix height 288px mobile / 320px desktop, center image bên trong.
- Image: đổi `h-auto w-full` → `max-h-full max-w-full w-auto h-auto` → giữ aspect ratio, vừa khít container.

### Trường hợp đặc biệt

- Biển báo 1 cái (portrait): hình co lại vừa height 288/320, rộng theo tỷ lệ, hai bên trống được center.
- Biển báo 3 cái (landscape rộng): hình co lại vừa width container, height nhỏ hơn 320 → vẫn nằm trong khung.
- Sa hình rộng > tall: tương tự, fit width, dư height được center.

### Acceptance

- Trên màn 1080p desktop, mở câu 312 (2 biển), 334 (1 biển), 486 (sa hình), 600 (sa hình rộng) → đáp án A/B luôn visible mà KHÔNG phải scroll.
- Mobile 414px width: ảnh không tràn ra ngoài container, đáp án A/B vẫn cách viewport bottom ≤ 1 thumb-stretch.
- Image không méo (aspect ratio giữ nguyên).

---

## Issue 2 — Keyboard shortcuts

### Spec

| Phím | Action |
|---|---|
| `1`, `2`, `3`, `4` (tới `answers.length`) | Chọn đáp án tương ứng |
| `→` hoặc `n` | Câu tiếp |
| `←` hoặc `p` | Câu trước |
| `Esc` | Bỏ focus khỏi input search (nếu đang ở input) |

Không trigger khi user đang gõ trong `<input>` / `<textarea>` (kiểm tra `event.target.tagName`).

### Code locations

1. **Thêm hook `useQuestionKeyboard`** trong `src/lib/keyboard.ts` (file mới):

```ts
"use client";
import { useEffect } from "react";

type Opts = {
  onSelect?: (index: number) => void;
  onPrev?: () => void;
  onNext?: () => void;
  answerCount: number;
  enabled?: boolean;
};

export function useQuestionKeyboard({ onSelect, onPrev, onNext, answerCount, enabled = true }: Opts) {
  useEffect(() => {
    if (!enabled) return;
    function handler(ev: KeyboardEvent) {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      if (ev.key >= "1" && ev.key <= "9") {
        const idx = parseInt(ev.key, 10) - 1;
        if (onSelect && idx < answerCount) {
          ev.preventDefault();
          onSelect(idx);
        }
      } else if (ev.key === "ArrowRight" || ev.key === "n" || ev.key === "N") {
        if (onNext) { ev.preventDefault(); onNext(); }
      } else if (ev.key === "ArrowLeft" || ev.key === "p" || ev.key === "P") {
        if (onPrev) { ev.preventDefault(); onPrev(); }
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSelect, onPrev, onNext, answerCount, enabled]);
}
```

2. **Wire vào StudyPage** (`src/components/GplxPages.tsx`):

Trong `StudyPage` (~ line 207), sau khi tính `activeQuestion`, thêm:

```tsx
useQuestionKeyboard({
  enabled: Boolean(activeQuestion),
  answerCount: activeQuestion?.answers.length ?? 0,
  onSelect: (idx) => activeQuestion && recordAnswer(activeQuestion, idx),
  onPrev: () => setCurrent((v) => Math.max(0, v - 1)),
  onNext: () => setCurrent((v) => Math.min(filteredQuestions.length - 1, v + 1)),
});
```

3. **Wire vào ExamPage** (~ line 357):

```tsx
useQuestionKeyboard({
  enabled: Boolean(activeQuestion) && !result,
  answerCount: activeQuestion?.answers.length ?? 0,
  onSelect: (idx) => {
    if (activeQuestion) {
      setAnswers((current) => ({ ...current, [activeQuestion.id]: idx }));
    }
  },
  onPrev: () => setCurrent((v) => Math.max(0, v - 1)),
  onNext: () => setCurrent((v) => Math.min(examQuestions.length - 1, v + 1)),
});
```

Không wire ResultPage (read-only review, ít giá trị).

### Visual hint — đổi label A/B/C/D → 1/2/3/4

PDF chính thức + hệ thống học gốc dùng số 1-4, không phải chữ A-D. Đổi cho nhất quán + phù hợp keyboard.

**`src/components/QuestionCard.tsx` line 91**:

```tsx
// Trước:
<span className="font-semibold">{String.fromCharCode(65 + index)}.</span> {answer}

// Sau:
<span className="font-semibold">{index + 1}.</span> {answer}
```

Same với line 102 (hiển thị đáp án đúng trong block kết quả): đổi `String.fromCharCode(65 + question.correctAnswer)` → `question.correctAnswer + 1`.

### Optional: hint section dưới question card

Thêm 1 dòng nhỏ hiển thị shortcut khi user mới vào Study mode, lần đầu, có thể dismiss:

```tsx
<p className="mt-2 text-xs text-slate-500">
  💡 Bấm <kbd>1-4</kbd> chọn đáp án, <kbd>←</kbd>/<kbd>→</kbd> đổi câu.
</p>
```

Đặt trong filter sidebar hoặc dưới progress bar.

### Acceptance

- Mở /study, bấm phím `2` → đáp án B được chọn + ghi vào localStorage.
- Bấm `→` → chuyển sang câu kế. Bấm `←` → quay lại.
- Focus vào ô "Nhập từ khóa" rồi bấm `1` → KHÔNG chọn đáp án (chỉ gõ "1" vào ô search).
- Trên /exam: tương tự, chọn đáp án bằng phím số, navigate bằng arrows.
- /result: phím không có tác dụng.

---

## Test plan

1. Unit test (tùy chọn): test `useQuestionKeyboard` với mock event dispatch.
2. E2E (playwright, đã có):
   - Thêm test bấm phím chọn đáp án trong study mode
   - Thêm test bấm arrow chuyển câu
3. Manual QA:
   - 1080p desktop: câu 312, 334, 302, 486, 599
   - 414px mobile (DevTools): cùng câu, đảm bảo đáp án visible without scroll
   - Bàn phím: 1-9 + arrows + n/p
   - Khi focus search input: phím số nhập text bình thường

## Files changed

- `src/lib/keyboard.ts` — **NEW**, ~30 dòng
- `src/components/QuestionCard.tsx` — sửa image container + đổi A/B → 1/2 (2 chỗ)
- `src/components/GplxPages.tsx` — thêm `useQuestionKeyboard` vào StudyPage + ExamPage
- (optional) thêm hint kbd dưới progress

Estimate: 30–45 phút implement + test.

## Commit suggestion

```
feat(ux): fix image container size + add keyboard shortcuts 1-4/←/→

- Cố định image height 288px mobile / 320px desktop, object-contain
  để biển báo đơn (portrait) không đẩy đáp án xuống dưới fold.
- Thêm hook useQuestionKeyboard: phím 1-9 chọn đáp án, ←/→ hoặc n/p
  navigate prev/next. Skip khi đang focus input/textarea.
- Đổi label đáp án từ A/B/C/D → 1/2/3/4 cho khớp với PDF chính thức
  và phím tắt.

Wire vào StudyPage + ExamPage. ResultPage không wire (read-only).
```

## Ngoài scope (defer phase 5)

- Animation transition giữa các câu.
- Highlight đáp án selected bằng outline focus.
- Tooltips dạng "Press 2 to select B" trên hover.
- Pinch-zoom cho image trên mobile (nếu cần xem chi tiết).
