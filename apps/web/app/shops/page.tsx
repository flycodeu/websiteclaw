import { ShopExplorer } from "@/components/shop-explorer";
import { getPublishedShopIndex } from "@/lib/published-data";

export const dynamic = "force-dynamic";

export default async function ShopsPage() {
  const { shops, publishedAt, meta } = await getPublishedShopIndex();

  return <ShopExplorer shops={shops} latestSyncAt={publishedAt} meta={meta} />;
}
