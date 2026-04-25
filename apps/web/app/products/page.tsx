import { InStockProductsBoard } from "@/components/in-stock-products-board";
import { getAvailableProductCategories, getAvailableProductPage } from "@/lib/product-feed";
import { getPublishedData } from "@shop-claw/shared/store";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const published = await getPublishedData();
  const initialPage = getAvailableProductPage(published);
  const categories = getAvailableProductCategories(published);

  return <InStockProductsBoard initialPage={initialPage} categories={categories} />;
}
