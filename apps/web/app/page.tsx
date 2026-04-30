import { ProductListBoard } from "@/components/in-stock-products-board";
import { getProductFeedPage } from "@/lib/product-feed";
import { getPublishedProductCatalog } from "@/lib/published-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const catalog = await getPublishedProductCatalog();
  const initialPage = getProductFeedPage(catalog, { limit: 24 });

  return <ProductListBoard initialPage={initialPage} latestSyncAt={catalog.publishedAt} meta={catalog.meta} />;
}
