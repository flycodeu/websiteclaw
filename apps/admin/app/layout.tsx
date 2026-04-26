import type { Metadata } from "next";
import { DM_Serif_Display, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const serif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-serif"
});

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans"
});

export const metadata: Metadata = {
  title: "商铺监控管理台",
  description: "用于数据源维护、抓取任务、人工验证、AI 分析和静态发布。"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth" className={`${serif.variable} ${sans.variable}`}>
      <body className="font-sans">
        <style>{`
          :root {
            --font-serif: ${serif.style.fontFamily};
            --font-sans: ${sans.style.fontFamily};
          }
          .font-serif { font-family: var(--font-serif); }
          .font-sans { font-family: var(--font-sans); }
        `}</style>
        {children}
      </body>
    </html>
  );
}
