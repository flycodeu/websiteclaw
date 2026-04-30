import type { Metadata } from "next";
import { DM_Serif_Display, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { SiteShell } from "@/components/site-shell";
import { getPublishedMeta } from "@/lib/published-data";

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

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "商铺监控面板",
  description: "面向公开访问者的店铺、商品、价格与发布变化监控界面。"
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const meta = await getPublishedMeta();

  return (
    <html lang="zh-CN" data-scroll-behavior="smooth" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body className="font-sans">
        <style>{`
          :root {
            --font-serif: ${serif.style.fontFamily};
            --font-sans: ${sans.style.fontFamily};
            --font-mono: ${mono.style.fontFamily};
          }
          .font-serif { font-family: var(--font-serif); }
          .font-sans { font-family: var(--font-sans); }
          .font-mono { font-family: var(--font-mono); }
        `}</style>
        <SiteShell latestSyncAt={meta.publishedAt} meta={meta}>
          {children}
        </SiteShell>
      </body>
    </html>
  );
}
