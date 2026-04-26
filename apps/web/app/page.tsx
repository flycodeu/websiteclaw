import { ProductListBoard } from "@/components/in-stock-products-board";
import { getProductFeedCategories, getProductFeedItems } from "@/lib/product-feed";
import { getPublishedData } from "@shop-claw/shared/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const published = await getPublishedData();
  const items = getProductFeedItems(published);
  const categories = getProductFeedCategories(published);

  return <ProductListBoard items={items} categories={categories} latestSyncAt={published.publishedAt} />;
}
