import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GPLX hang B",
  description: "Hoc va thi thu 600 cau hoi GPLX hang B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
