import { shops } from "@/lib/mock-data";
import { withTraceId } from "@/lib/response";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword")?.toLowerCase();
  const status = searchParams.get("status");
  const sort = searchParams.get("sort");

  const result = [...shops]
    .filter((shop) => {
      const keywordMatched =
        !keyword ||
        shop.name.toLowerCase().includes(keyword) ||
        shop.tags.some((tag) => tag.toLowerCase().includes(keyword));
      const statusMatched = !status || status === "ALL" || shop.status === status;
      return keywordMatched && statusMatched;
    })
    .sort((a, b) => {
      if (sort === "price") {
        return a.lowestPrice - b.lowestPrice;
      }
      if (sort === "updated") {
        return Date.parse(b.lastCrawledAt) - Date.parse(a.lastCrawledAt);
      }
      return b.stabilityScore - a.stabilityScore;
    });

  return Response.json(withTraceId(result));
}
