import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MotorFit",
  description: "SRM_2023 Excel 계산 로직을 재현하는 교육용 설계 분석 도구",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
