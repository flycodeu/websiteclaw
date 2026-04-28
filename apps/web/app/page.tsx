import { ProductListBoard } from "@/components/in-stock-products-board";
import { getProductFeedCategories, getProductFeedItems } from "@/lib/product-feed";
import { getPublishedSnapshot } from "@/lib/published-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const published = await getPublishedSnapshot();
  const items = getProductFeedItems(published);
  const categories = getProductFeedCategories(published);

  return <ProductListBoard items={items} categories={categories} latestSyncAt={published.publishedAt} />;
}
