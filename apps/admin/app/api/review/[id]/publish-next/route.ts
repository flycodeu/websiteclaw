import { withTraceId } from "@shop-claw/shared/response";
import { publishReviewAndContinue } from "@/lib/task-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readParams(context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await context.params;
  return params.id;
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const id = await readParams(context);

  try {
    const result = await publishReviewAndContinue(id);
    const message = result.nextTask
      ? `已发布公开数据，并开始抓取下一站：${result.nextTask.sourceName}（V${result.crawlVersion}）`
      : `已发布公开数据，本批次 V${result.crawlVersion} 已完成`;

    return Response.json(withTraceId(result, message));
  } catch (error) {
    return Response.json(
      withTraceId(null, error instanceof Error ? error.message : "发布并继续下一站失败"),
      { status: 400 }
    );
  }
}
