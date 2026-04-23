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
  const { shops, snapshots, diffs } = await getPublishedData();
  const shop = shops.find((item) => item.shopId === shopId);
  const snapshot = snapshots.find((item) => item.shopId === shopId);
  const diff = diffs.find((item) => item.shopId === shopId);
  const result = shop && snapshot ? { shop, snapshot, diff } : null;

  if (!result) {
    return Response.json(withTraceId(null, "商铺不存在"), { status: 404 });
  }

  return Response.json(withTraceId(result));
}
