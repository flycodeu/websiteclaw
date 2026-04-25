import { ShopExplorer } from "@/components/shop-explorer";
import { getPublishedData } from "@shop-claw/shared/store";

export const dynamic = "force-dynamic";

export default async function ShopsPage() {
  const { shopProducts, shops } = await getPublishedData();

  return <ShopExplorer shops={shops} products={shopProducts} />;
}
