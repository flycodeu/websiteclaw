import { withTraceId } from "@shop-claw/shared/response";
import { getPublishedData } from "@shop-claw/shared/store";
import { getProductFeedPage } from "@/lib/product-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const published = await getPublishedData();
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");

  const page = getProductFeedPage(published, {
    category: searchParams.get("category"),
    cursor: searchParams.get("cursor"),
    keyword: searchParams.get("keyword"),
    minPrice: readNumberParam(searchParams.get("minPrice")),
    maxPrice: readNumberParam(searchParams.get("maxPrice")),
    limit: limitParam ? Number.parseInt(limitParam, 10) : undefined
  });

  return Response.json(withTraceId(page));
}

function readNumberParam(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
