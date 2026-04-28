import { withTraceId } from "@shop-claw/shared/response";
import { getPublishedSnapshot } from "@/lib/published-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { shopDiffs } = await getPublishedSnapshot();
  return Response.json(withTraceId(shopDiffs.slice(0, 10)));
}
