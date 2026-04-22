import { sources } from "@shop-claw/shared/mock-data";
import { withTraceId } from "@shop-claw/shared/response";

export async function GET() {
  return Response.json(withTraceId(sources));
}

export async function POST(request: Request) {
  const payload = await request.json();
  return Response.json(
    withTraceId(
      {
        ...payload,
        sourceId: payload.sourceId ?? "src_new"
      },
      "source created in mock mode"
    ),
    { status: 201 }
  );
}
