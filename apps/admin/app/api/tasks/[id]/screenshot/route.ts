import { promises as fs } from "node:fs";
import path from "node:path";
import { getTaskById, resolveWorkspaceRoot } from "@shop-claw/shared/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readParams(context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await context.params;
  return params.id;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const id = await readParams(context);
  const task = await getTaskById(id);
  const relativePath = task?.artifacts?.screenshotPath?.trim();

  if (!relativePath) {
    return new Response("未找到截图", { status: 404 });
  }

  try {
    const workspaceRoot = await resolveWorkspaceRoot();
    const screenshot = await fs.readFile(path.join(workspaceRoot, relativePath));

    return new Response(screenshot, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "image/png"
      }
    });
  } catch {
    return new Response("截图不可用", { status: 404 });
  }
}
