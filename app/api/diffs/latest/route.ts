import { diffs } from "@/lib/mock-data";
import { withTraceId } from "@/lib/response";

export async function GET() {
  return Response.json(withTraceId(diffs));
}
