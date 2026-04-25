import { withTraceId } from "@shop-claw/shared/response";
import { getPublishedData } from "@shop-claw/shared/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readParams(context: { params: Promise<{ shopId: string }> | { shopId: string } }) {
  const params = await context.params;
  return params.shopId;
}

export async function GET(_request: Request, context: { params: Promise<{ shopId: string }> | { shopId: string } }) {
  const shopId = await readParams(context);
  const { shops, shopProducts, shopSnapshots, shopDiffs } = await getPublishedData();
  const shop = shops.find((item) => item.shopId === shopId);

  if (!shop) {
    return Response.json(withTraceId(null, "店铺不存在"), { status: 404 });
  }

  const result = {
    shop,
    products: shopProducts.filter((item) => item.shopId === shopId),
    recentSnapshots: shopSnapshots.filter((item) => item.shopId === shopId).slice(0, 10),
    recentDiffs: shopDiffs.filter((item) => item.shopId === shopId).slice(0, 10)
  };

  return Response.json(withTraceId(result));
}
