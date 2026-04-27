export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readParams(context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await context.params;
  return params.id;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const id = await readParams(context);

  try {
    const { getManualVerificationSessionScreenshot } = await import("@/lib/playwright-crawler");
    const screenshot = await getManualVerificationSessionScreenshot(id);

    if (!screenshot) {
      return new Response("人工验证会话不存在，请先启动人工验证。", {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8"
        }
      });
    }

    return new Response(new Uint8Array(screenshot), {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "image/png"
      }
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "读取人工验证截图失败", {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }
}
