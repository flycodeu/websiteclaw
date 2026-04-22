import { ShopExplorer } from "@/components/shop-explorer";
import { diffs, snapshots, shops } from "@shop-claw/shared/mock-data";

export default function ShopsPage() {
  return <ShopExplorer shops={shops} snapshots={snapshots} diffs={diffs} />;
}
