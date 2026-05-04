import { withTraceId } from "@shop-claw/shared/response";
import { getShopFeedPage } from "@/lib/shop-feed";
import { getPublishedShopIndex } from "@/lib/published-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const index = await getPublishedShopIndex();
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");

  const page = getShopFeedPage(index, {
    cursor: searchParams.get("cursor"),
    keyword: searchParams.get("keyword"),
    merchantType: searchParams.get("merchantType"),
    status: searchParams.get("status"),
    sort: searchParams.get("sort"),
    limit: limitParam ? Number.parseInt(limitParam, 10) : undefined
  });

  return Response.json(withTraceId(page));
}
