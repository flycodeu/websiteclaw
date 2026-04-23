import { withTraceId } from "@shop-claw/shared/response";
import { getPublishedData } from "@shop-claw/shared/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { diffs } = await getPublishedData();
  return Response.json(withTraceId(diffs));
}
