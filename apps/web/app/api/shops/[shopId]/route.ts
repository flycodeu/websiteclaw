import { withTraceId } from "@shop-claw/shared/response";
import { getPublishedShopDetail } from "@/lib/published-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readParams(context: { params: Promise<{ shopId: string }> | { shopId: string } }) {
  const params = await context.params;
  return params.shopId;
}

export async function GET(_request: Request, context: { params: Promise<{ shopId: string }> | { shopId: string } }) {
  const shopId = await readParams(context);
  const detail = await getPublishedShopDetail(shopId);

  if (!detail) {
    return Response.json(withTraceId(null, "店铺不存在"), { status: 404 });
  }

  return Response.json(withTraceId(detail));
}
