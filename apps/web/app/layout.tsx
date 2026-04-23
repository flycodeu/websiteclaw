import type { Metadata } from "next";
import { DM_Serif_Display, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { SiteShell } from "@/components/site-shell";
import { getPublishedData } from "@shop-claw/shared/store";

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
  title: "商铺情报台",
  description: "价格、库存和店铺稳定度的同步追踪前台。"
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const published = await getPublishedData();

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
        <SiteShell latestSyncAt={published.publishedAt}>{children}</SiteShell>
      </body>
    </html>
  );
}
