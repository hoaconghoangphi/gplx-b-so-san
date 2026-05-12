# GPLX B So San

Web app hoc va thi thu ly thuyet GPLX oto hang B so san.

## Tinh nang

- Hoc theo bo 600 cau hoi
- Loc theo chuong
- Tim kiem theo tu khoa
- Danh dau va theo doi tien do bang `localStorage`
- Thi thu 30 cau, 20 phut
- Co cau diem liet, sai la truot ngay
- Chon de ngau nhien hoac 1 trong 20 bo de preset
- Giao dien tieng Viet, responsive cho mobile

## Cong nghe

- Next.js App Router
- TypeScript
- Tailwind CSS
- Du lieu JSON local tai `src/data/questions.json`
- Khong dung backend cho MVP

## Chay local

Yeu cau:

- Node.js 20+
- npm

Cai dependencies:

```bash
npm install
```

Chay development server:

```bash
npm run dev
```

App mac dinh chay tai:

```text
http://localhost:3002
```

Build production:

```bash
npm run build
npm run start
```

Production server local cung dung port `3002`.

## Cau truc project

```text
src/
  app/
    page.tsx
    study/
      page.tsx
    exam/
      page.tsx
    result/
      page.tsx
  components/
    DashboardCard.tsx
    ProgressBar.tsx
    QuestionCard.tsx
    Timer.tsx
  data/
    questions.json
  lib/
    exam.ts
    storage.ts
    types.ts
```

## Du lieu

- Bo 600 cau hoi va anh duoc luu trong repo
- Tien do hoc, lich su thi, cau sai duoc luu trong `localStorage`

## Deploy

Production:

```text
https://gplx-b-so-san.vercel.app
```

Repo da duoc connect voi Vercel qua GitHub. Moi lan push len nhanh `master`, Vercel se tu build va deploy.
