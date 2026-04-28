import { ShopExplorer } from "@/components/shop-explorer";
import { getPublishedSnapshot } from "@/lib/published-data";

export const dynamic = "force-dynamic";

export default async function ShopsPage() {
  const { shopProducts, shops } = await getPublishedSnapshot();

  return <ShopExplorer shops={shops} products={shopProducts} />;
}
