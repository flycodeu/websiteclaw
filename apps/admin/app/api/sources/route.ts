import { getPlatformState } from "@shop-claw/shared/store";
import { withTraceId } from "@shop-claw/shared/response";
import { createSource } from "@shop-claw/shared/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getPlatformState();
  return Response.json(withTraceId(state.sources));
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const source = await createSource(payload);
    return Response.json(withTraceId(source, "数据源已创建"), { status: 201 });
  } catch (error) {
    return Response.json(
      withTraceId(null, error instanceof Error ? error.message : "创建数据源失败"),
      { status: 400 }
    );
  }
}
