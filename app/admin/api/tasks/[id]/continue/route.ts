import { withTraceId } from "@/lib/response";

async function readParams(context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await context.params;
  return params.id;
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const id = await readParams(context);
  return Response.json(withTraceId({ id, status: "CRAWLING" }, "manual verification accepted"));
}
