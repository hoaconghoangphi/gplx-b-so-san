# Upgrade Plan: GPLX Hang B Study + Practice + Mock Exam

## Summary

Hien trang project da co nen tot: Next.js App Router, 600 cau JSON local, 318 anh, 60 cau diem liet, dung phan bo 6 chuong, hoc theo bo loc, thi thu 30 cau/20 phut, localStorage progress, Vercel deploy tu GitHub.

Thieu hut chinh:

- Giai thich moi co `9/600` cau; Study mode co khung giai thich sau khi chon dap an nhung da so dang fallback chung.
- `/result` sau khi roi man thi chi luu `wrongQuestionIds`, chua luu dap an nguoi dung da chon nen review chua du.
- Chua co che do luyen rieng theo cau sai, chua hoc, diem liet, co anh, co meo, theo chuong.
- Chua co validator du lieu tu dong de bat loi cau hoi, dap an, anh, diem liet, phan bo de.
- Chua co test runner/E2E de chong regression khi sua du lieu hoac UI.
- Co nguon hoc lai xe chinh thuc va tai lieu giay meo/quy luat do nguoi dung cung cap bang anh; he thong online random thu tu nen phai match theo noi dung, khong dua vao so cau hien thi.

## Phase 1: Data Quality + Verification Workflow

- Them data validator chinh thuc:
  - du 600 cau, ID 1-600 khong trung
  - dung range chuong: 1-180, 181-205, 206-263, 264-300, 301-485, 486-600
  - dung 60 cau diem liet theo danh sach hien tai
  - dap an hop le, `correctAnswer` nam trong range
  - anh duoc tham chieu phai ton tai trong `public`
  - canh bao cau thieu `explanation` hoac thieu `memoryTip`
- Chuan hoa schema cau hoi:
  - giu `explanation: string`
  - them optional `explanationSource?: "official-capture" | "paper-note" | "source" | "ai-draft" | "manual"`
  - them optional `explanationReview?: "verified" | "needs-review"`
  - them optional `verifiedAgainst?: string`
  - them optional `memoryTip?: string`
  - them optional `tipSource?: "paper-note" | "source" | "ai-draft" | "manual"`
- Tao folder tham chieu:
  - `reference/official-captures/`
  - `reference/paper-notes/`
- Them quy trinh match reference:
  - official capture match theo normalized question text va answer text
  - paper notes match theo keyword/rule/topic, co the ap dung cho nhieu cau cung nhom
  - bo qua so thu tu tu he thong chinh thuc vi thu tu random
  - neu match khong chac, xuat danh sach can nguoi dung xac nhan

## Phase 2: Explanations + Learning Modes

- Bo sung he thong giai thich theo huong ket hop:
  - tu anh chup he thong chinh thuc: `official-capture`, `verified`
  - tu tai lieu giay meo/quy luat: `paper-note`, `verified` neu nguoi dung xac nhan anh ro
  - tu tai lieu/web/PDF ro nguon: `source`, `verified`
  - tu AI ghi nho/meo hoc: `ai-draft`, `needs-review`
  - tu nguoi dung tu chinh: `manual`, `verified`
- Chi yeu cau nguoi dung ho tro capture khi:
  - cau diem liet thieu hoac nghi ngo giai thich
  - cau co dap an/anh khong chac
  - cau nguoi dung hay sai
  - cau luat co so lieu, thoi han, muc diem, khoang cach
  - nhom cau co the ap dung meo tu tai lieu giay
- Cai tien Study mode:
  - tab/bo loc nhanh: Tat ca, Chua hoc, Cau sai, Diem liet, Co hinh, Co meo, Theo chuong
  - sau khi chon dap an: hien dung/sai, dap an dung, giai thich, meo nho, trang thai nguon
  - them nut "Luyen cau sai", "Luyen diem liet", "On meo"

## Phase 3: Mock Exam + Result Review

- Nang cap du lieu lich su thi:
  - luu `selectedAnswers: Record<questionId, answerIndex>`
  - luu `examQuestionIds`
- Cai tien Result screen:
  - xem lai toan bo 30 cau hoac chi cau sai
  - hien thi nguoi dung chon gi, dap an dung la gi, giai thich, meo nho, anh neu co
  - danh dau ro sai cau diem liet la ly do truot
- Giu cau truc de hien tai:
  - 30 cau, 20 phut, dat tu 27/30
  - luon co it nhat 1 cau diem liet
  - sai diem liet la truot
  - random hoac chon 1 trong 20 de preset
- Them thong ke dashboard:
  - ty le dung theo chuong
  - so cau sai con ton
  - tien do cau diem liet
  - lich su diem thi gan nhat

## Tools / Skills

- Packages:
  - `vitest`
  - `@testing-library/react`
  - `@testing-library/jest-dom`
  - `@playwright/test`
  - `zod`
- Scripts:
  - `npm run validate:data`
  - `npm run test`
  - `npm run test:e2e`
  - `npm run check`
- Tooling xu ly reference:
  - OCR anh official capture va paper notes neu can
  - report match chac/match yeu/khong match
  - khong tu dong ghi de du lieu khi match yeu

## Test Plan

- Unit tests:
  - `makeBExam()` luon tao dung 30 cau
  - de co it nhat 1 cau diem liet
  - phan bo chuong dung blueprint hang B
  - sai diem liet thi `passed = false`
  - `PASS_SCORE = 27`
  - `formatTime()` dung
- Data validation tests:
  - 600 cau hop le
  - 318 anh hien tai khong mat file
  - 60 cau diem liet khop danh sach
  - cau thieu giai thich/meo duoc report, khong fail build o phase dau
- Reference matching tests:
  - match duoc khi noi dung cau giong nhung so thu tu khac
  - paper-note rule co the lien ket nhieu cau
  - match yeu khi cau gan giong nhung dap an lech
  - khong tu dong ghi de du lieu khi do tin cay thap
- Verification truoc deploy:
  - `npm run lint`
  - `npm run validate:data`
  - `npm run test`
  - `npm run build`
  - kiem tra nhanh UI local tai `http://localhost:3002`

## User Support

- Khi he thong xuat danh sach cau can verify, nguoi dung chi can capture cac cau do tu he thong chinh thuc.
- Anh official capture nen gom du: cau hoi, cac dap an, dap an dung neu hien thi, va phan giai thich.
- Anh tai lieu giay nen chup ro tung nhom meo/quy luat, tranh bong va nghieng qua nhieu.
- Vi he thong chinh thuc random thu tu, khong can luu theo so cau cua he thong; ten file co the dat theo noi dung ngan, nhom meo, hoac ID trong app neu dang doi chieu tu app.
- Khong can bo sung toan bo 600 cau; chi ho tro cac cau thieu thong tin, khong chac chan, cau diem liet, cau co rui ro cao, hoac nhom meo huu ich.

## Assumptions

- Uu tien dau tien la chat luong du lieu.
- Giai thich dung chien luoc ket hop, nhung moi noi dung chua kiem chung se duoc gan `needs-review`.
- Du lieu tu he thong chinh thuc la nguon verify manh nhat khi match chac bang noi dung.
- Tai lieu giay duoc dung chu yeu de tao `memoryTip` hoac quy luat hoc nhanh; khong dung de thay dap an neu khong co doi chieu ro.
- Vercel da connect GitHub native, nen khong khoi phuc GitHub Actions deploy workflow.
- Local development tiep tuc dung port `3002`.
