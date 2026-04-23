import { ShopExplorer } from "@/components/shop-explorer";
import { getPublishedData } from "@shop-claw/shared/store";

export const dynamic = "force-dynamic";

export default async function ShopsPage() {
  const { diffs, snapshots, shops } = await getPublishedData();

  return <ShopExplorer shops={shops} snapshots={snapshots} diffs={diffs} />;
}
