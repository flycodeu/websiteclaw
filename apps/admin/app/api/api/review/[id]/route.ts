import { getReview } from "@/lib/mock-data";
import { withTraceId } from "@/lib/response";

async function readParams(context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await context.params;
  return params.id;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const id = await readParams(context);
  const review = getReview(id);

  if (!review) {
    return Response.json(withTraceId(null, "review not found"), { status: 404 });
  }

  return Response.json(withTraceId(review));
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const id = await readParams(context);
  const payload = await request.json();
  return Response.json(withTraceId({ id, ...payload }, "review saved in mock mode"));
}
