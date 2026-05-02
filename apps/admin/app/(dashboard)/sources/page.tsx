import { getPlatformState } from "@shop-claw/shared/store";
import { SourcesConsole } from "@/components/sources-console";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const state = await getPlatformState();

  return <SourcesConsole sources={state.sources} publishedShops={state.published.shops} crawlBatch={state.crawlBatch} />;
}
