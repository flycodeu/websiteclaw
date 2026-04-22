import { diffs } from "@shop-claw/shared/mock-data";
import { withTraceId } from "@shop-claw/shared/response";

export async function GET() {
  return Response.json(withTraceId(diffs));
}
