import { withTraceId } from "@shop-claw/shared/response";
import { getPublishedDiffFeed } from "@/lib/published-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { items, publishedAt } = await getPublishedDiffFeed();
  return Response.json(
    withTraceId({
      items: items.slice(0, 10),
      publishedAt
    })
  );
}
