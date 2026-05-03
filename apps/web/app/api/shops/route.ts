import { withTraceId } from "@shop-claw/shared/response";
import { merchantTypeLabels, productCategoryLabels } from "@shop-claw/shared/labels";
import { getPublishedShopIndex } from "@/lib/published-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { shops, publishedAt, meta } = await getPublishedShopIndex();
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword")?.toLowerCase();
  const merchantType = searchParams.get("merchantType");
  const status = searchParams.get("status");
  const sort = searchParams.get("sort");

  const result = [...shops]
    .filter((shop) => {
      const keywordMatched =
        !keyword ||
        shop.name.toLowerCase().includes(keyword) ||
        shop.categories.some(
          (category) =>
            category.toLowerCase().includes(keyword) || productCategoryLabels[category].toLowerCase().includes(keyword)
        ) ||
        merchantTypeLabels[shop.merchantType].toLowerCase().includes(keyword);
      const merchantTypeMatched = !merchantType || merchantType === "ALL" || shop.merchantType === merchantType;
      const statusMatched = !status || status === "ALL" || shop.status === status;
      return keywordMatched && merchantTypeMatched && statusMatched;
    })
    .sort((a, b) => {
      if (sort === "price") {
        if (a.lowestPrice === 0) {
          return 1;
        }

        if (b.lowestPrice === 0) {
          return -1;
        }

        return a.lowestPrice - b.lowestPrice;
      }

      if (sort === "changes") {
        return b.recentChangeCount - a.recentChangeCount;
      }

      return Date.parse(b.lastCrawledAt) - Date.parse(a.lastCrawledAt);
    });

  return Response.json(
    withTraceId({
      items: result,
      publishedAt,
      meta
    })
  );
}
