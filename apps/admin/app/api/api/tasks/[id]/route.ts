import { tasks } from "@/lib/mock-data";
import { withTraceId } from "@/lib/response";

async function readParams(context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await context.params;
  return params.id;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const id = await readParams(context);
  const task = tasks.find((item) => item.id === id);

  if (!task) {
    return Response.json(withTraceId(null, "task not found"), { status: 404 });
  }

  return Response.json(withTraceId(task));
}
