import { ShopExplorer } from "@/components/shop-explorer";
import { getPublishedShopIndex } from "@/lib/published-data";
import { getShopFeedPage } from "@/lib/shop-feed";

export const dynamic = "force-dynamic";

export default async function ShopsPage() {
  const index = await getPublishedShopIndex();
  const initialPage = getShopFeedPage(index, { limit: 24 });

  return <ShopExplorer initialPage={initialPage} />;
}
