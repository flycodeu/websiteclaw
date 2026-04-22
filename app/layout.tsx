import type { Metadata } from "next";
import { DM_Serif_Display, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { SiteShell } from "@/components/site-shell";

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
  title: "Shop Claw | 商铺商品监控与分析平台",
  description: "基于 Next.js 构建的商铺商品监控、比价、稳定度分析与管理端平台。"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={`${serif.variable} ${sans.variable}`}>
      <body className="font-sans">
        <style>{`
          :root {
            --font-serif: ${serif.style.fontFamily};
            --font-sans: ${sans.style.fontFamily};
          }
          .font-serif { font-family: var(--font-serif); }
          .font-sans { font-family: var(--font-sans); }
        `}</style>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
