import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UniLink - 대학생 커뮤니티",
  description:
    "시간표 공유, 강의 커뮤니티, AI 학습 계획까지 대학생활을 한곳에서 관리하세요.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
