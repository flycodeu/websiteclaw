import { getShopDetail } from "@shop-claw/shared/mock-data";
import { withTraceId } from "@shop-claw/shared/response";

async function readParams(context: { params: Promise<{ shopId: string }> | { shopId: string } }) {
  const params = await context.params;
  return params.shopId;
}

export async function GET(_request: Request, context: { params: Promise<{ shopId: string }> | { shopId: string } }) {
  const shopId = await readParams(context);
  const result = getShopDetail(shopId);

  if (!result) {
    return Response.json(withTraceId(null, "shop not found"), { status: 404 });
  }

  return Response.json(withTraceId(result));
}
