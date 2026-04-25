import { withTraceId } from "@shop-claw/shared/response";
import { getPublishedData } from "@shop-claw/shared/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { shopDiffs } = await getPublishedData();
  return Response.json(withTraceId(shopDiffs.slice(0, 10)));
}
