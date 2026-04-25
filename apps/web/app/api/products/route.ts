import { withTraceId } from "@shop-claw/shared/response";
import { getPublishedData } from "@shop-claw/shared/store";
import { getAvailableProductPage } from "@/lib/product-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const published = await getPublishedData();
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");

  const page = getAvailableProductPage(published, {
    category: searchParams.get("category"),
    cursor: searchParams.get("cursor"),
    limit: limitParam ? Number.parseInt(limitParam, 10) : undefined
  });

  return Response.json(withTraceId(page));
}
