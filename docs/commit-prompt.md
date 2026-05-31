# Handoff Prompt — Commit toàn bộ work của 3 phase

> Self-contained prompt cho agent có git access (Claude Code / agent local trên Windows).
> Mục tiêu: stage + commit + push toàn bộ changes của 3 phase (captures, paper-tips, PDF verify) thành các commit logic, sau khi đảm bảo CI pass.

---

## 1. Bối cảnh

Repo: `gplx-b-so-san` (Next.js Vietnamese GPLX learning app), branch `master`. Vừa hoàn thành 3 phase work lớn:

1. **Phase 1 — Official captures → explanation**: ingest 139 ảnh chụp từ hệ thống học chính thức, fill `explanation` cho 132 câu trong `src/data/questions.json`.
2. **Phase 2 — Paper-notes PDF → memoryTip**: trích PDF tài liệu giấy "Hướng Dẫn và Mẹo Làm Bài.pdf", auto-apply 147 câu + user review thêm 39 câu = **195/600 câu có memoryTip**.
3. **Phase 3 — PDF correctAnswer verify**: extract underlined đáp án từ PDF 600 câu chính thức, đối chiếu JSON, fix các discrepancy (1 case: q527 0→2).

Anh hiện đang ở root repo `gplx-b-so-san`. Chạy mọi lệnh tại đây.

## 2. Tình trạng hiện tại

Trước khi commit, kiểm tra:

```bash
git status --short | wc -l   # ~160 files (157+ untracked + 3 modified)
npm run validate:data        # phải exit 0, total 600, explanationCount~132, memoryTipCount~195
npm run test                 # 7/7 pass
```

3 file modified:
- `.gitignore` (thay đổi whitespace cuối file)
- `package.json` (thêm npm scripts: build:capture-todo, find:duplicates, extract:pdf, diff:pdf-json, apply:pdf-fixes, review:tips, apply:tips)
- `src/data/questions.json` (chính: 132 explanation + 195 memoryTip + q527/q489 fixes)

~157 file untracked, phân bố:
- `docs/` — capture-guide, capture-todo, ingest-prompt-v1/v2/v3, paper-notes-prompt, paper-tips-chunks, commit-prompt
- `scripts/` — apply-pdf-fixes, apply-tips-decisions, build-capture-todo, build-tips-review, diff-pdf-vs-json, extract-pdf-answers, find-duplicate-questions, ingest-captures, ingest-paper-notes
- `reports/` — captures-*, paper-tips-*, pdf-*, tips-*, ingest-summary, pdf-vs-json-summary (audit logs)
- `reference/official-captures/` — **139 PNG ảnh chụp**, ~53MB — **KHÔNG commit** (đã có audit trail qua `verifiedAgainst` trong JSON)
- `reference/paper-notes/Hướng Dẫn và Mẹo Làm Bài.pdf` — **178MB scanned PDF**, **KHÔNG được commit**
- `scripts/__pycache__/` — Python bytecode, **KHÔNG được commit**
- Backups: `reports/questions-before-*-apply.json` — **KHÔNG được commit**
- Review tool: `reports/tips-review.html` — generated, **KHÔNG được commit**

## 3. Pre-flight cleanup (BẮT BUỘC trước commit)

### 3.1 Update `.gitignore`

Thêm các pattern sau vào cuối file:

```gitignore
# large/binary artifacts
reference/paper-notes/*.pdf
reference/official-captures/
scripts/__pycache__/

# temp pdf extracts
*.pdftest*

# generated review tool + per-run backups
reports/questions-before-*-apply.json
reports/tips-review.html

# user-exported review decisions (per-run)
reports/tips-decisions.json
```

Note về `reference/official-captures/`: 139 PNG (~53MB) là input nguồn cho ingest. JSON đã giữ audit qua `verifiedAgainst: "IMG_XX.png"` per câu, ai cần re-run có thể yêu cầu user share folder qua kênh khác. Không cần ép repo size.

Lý do: PDF paper-notes 178MB push sẽ fail; backups + review HTML là local artifacts, generate lại được; tips-decisions.json là output từ browser review per-run.

### 3.2 Verify nothing critical broken

```bash
npm run validate:data
npm run test
npm run lint
```

Expected output từ validate:
```json
{
  "total": 600,
  "criticalCount": 60,
  "explanationCount": 132,
  "memoryTipCount": 195,
  "errors": 0
}
```

Nếu fail bất kỳ → STOP, báo user trước khi commit.

### 3.3 Cleanup workspace

```bash
rm -rf scripts/__pycache__
rm -rf /tmp/pdftest*
```

## 4. Commit strategy

Đề xuất **3 commit logic**, theo thứ tự (sao cho mỗi commit pass test riêng):

### Commit 1: Tooling + docs (không touch data)

```bash
git add .gitignore package.json

git add scripts/build-capture-todo.mjs
git add scripts/find-duplicate-questions.mjs
git add scripts/ingest-captures.mjs
git add scripts/ingest-paper-notes.mjs
git add scripts/extract-pdf-answers.py
git add scripts/diff-pdf-vs-json.mjs
git add scripts/apply-pdf-fixes.mjs
git add scripts/build-tips-review.mjs
git add scripts/apply-tips-decisions.mjs

git add docs/capture-guide.md
git add docs/capture-todo.md
git add docs/capture-todo.json
git add docs/ingest-prompt.md
git add docs/ingest-prompt-v2.md
git add docs/ingest-prompt-v3.md
git add docs/paper-notes-prompt.md
git add docs/paper-tips-chunks.json
git add docs/commit-prompt.md

git commit -m "feat(tooling): add data-quality scripts and handoff prompts

Scripts:
- build-capture-todo.mjs: prioritize questions needing official capture
- ingest-captures.mjs: OCR + fuzzy match captures into questions.json
- ingest-paper-notes.mjs: extract paper-note PDF → memoryTip chunks
- extract-pdf-answers.py: detect underline in source PDF for correctAnswer
- diff-pdf-vs-json.mjs + apply-pdf-fixes.mjs: verify/fix JSON against PDF
- build-tips-review.mjs: generate self-contained HTML for user to review draft tips
- apply-tips-decisions.mjs: apply user-reviewed tips decisions
- find-duplicate-questions.mjs: detect duplicate question text in dataset

Docs:
- capture guide + 3 ingest prompts (v1, v2, v3)
- paper-notes prompt + chunks
- commit prompt (this file)

npm aliases:
- build:capture-todo, find:duplicates, extract:pdf, diff:pdf-json,
  apply:pdf-fixes, review:tips, apply:tips

.gitignore: exclude large paper-notes PDF, __pycache__, generated review
tool, per-run backups."
```

### Commit 2: Data enrichment (questions.json + reference/captures + reports)

```bash
git add src/data/questions.json
git add reports/

git commit -m "feat(data): enrich questions with 132 explanations + 195 memoryTips

Phase 1 - Official captures → explanation:
- Ingest 139 PNG captures from official GPLX learning system
- Fuzzy match by content (system random shuffles order)
- OCR with tesseract.js + vie.traineddata, sidebar crop 22%, top header
  crop 8%, OCR noise cleanup, multi-question split
- 132/600 questions now have explanation from official source
- explanationSource='official-capture', explanationReview='verified',
  verifiedAgainst='IMG_XX.png' for traceability

Phase 2 - Paper-notes PDF → memoryTip:
- OCR 'Hướng Dẫn và Mẹo Làm Bài.pdf' (7 pages, scanned image)
- Extract 32 topic chunks (tuổi, cấu tạo, biển báo, etc.)
- Auto-apply 147 câu (>=0.85 confidence)
- User reviewed 168 draft entries via reports/tips-review.html:
  - 39 accepted/edited → applied
  - 129 rejected
- memoryTipCount: 9 → 195
- tipSource='paper-note' cho 186 câu, manual cho 9 câu seed

Phase 3 - PDF correctAnswer verify:
- Extract underlined correct answers from 600cau PDF (594/600 parsed)
- Compare with JSON: 593/594 already match, 1 mismatch fixed:
  - q527: correctAnswer 0 → 2 (PDF says 'Xe con.')
- Also fixed during capture conflicts: q489 explanation from IMG_05.png
  (originally mis-mapped to q488)

Reports added in reports/ for full audit trail (captures-*, paper-tips-*,
pdf-vs-json-*, tips-apply-log).

reference/ binary artifacts excluded via .gitignore (kept locally):
- official-captures/ (139 PNG, ~53MB) — sources for ingest; JSON tracks
  per-question audit via verifiedAgainst='IMG_XX.png'.
- paper-notes/*.pdf (178MB scanned)."
```

### Commit 3 (optional): Update docs về trạng thái mới

```bash
# Chỉ nếu có sửa thêm
git add docs/upgrade-plan.md README.md 2>/dev/null
git commit -m "docs: update plan with phase 1-3 completion stats" || true
```

## 5. Verify post-commit

```bash
git log --oneline -5
git status                    # phải clean
npm run check                 # lint + validate + test pass
```

`git status` expected:
- Còn `reference/paper-notes/Hướng Dẫn và Mẹo Làm Bài.pdf` (ignored)
- Còn `reference/official-captures/` (ignored, 139 PNG ~53MB local)
- Còn `reports/tips-review.html`, `reports/questions-before-*-apply.json` (ignored)
- Không còn file modified hoặc untracked nào khác

## 6. Push

```bash
git push origin master
```

Repo connect Vercel native — sau khi push, Vercel auto-deploy. Check deploy:
- https://gplx-b-so-san.vercel.app
- Vercel dashboard log

## 7. Rollback nếu hỏng

```bash
# Nếu commit nhưng chưa push
git reset --soft HEAD~3       # giữ changes, undo 3 commits

# Nếu đã push nhưng phát hiện sai
git revert HEAD~2..HEAD
git push
```

## 8. QA checklist

- [ ] `npm run validate:data` exit 0 trước commit (600 câu, errors=0)
- [ ] `npm run test` 7/7 pass trước commit
- [ ] `npm run lint` clean
- [ ] `.gitignore` đã exclude paper-notes PDF, __pycache__, backups, review.html
- [ ] PDF 178MB KHÔNG nằm trong staged files (`git diff --cached --stat | sort -k3 -rn | head` không có file > 5MB ngoài images đã biết)
- [ ] 3 commit message rõ ràng, có context
- [ ] Push thành công không error
- [ ] Vercel auto-deploy trigger (check dashboard)

## 9. Output mong muốn

In ra cho user:
- Số commit đã tạo + commit hash (3 dòng `git log --oneline -3`)
- Tổng số file changed per commit (`git show --stat <hash>` rút gọn)
- Tổng kích thước push (KB/MB)
- Vercel deploy URL nếu trigger

Sẵn sàng. Bắt đầu.
