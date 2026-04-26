import { handleEmbeddedVerificationProxyRequest } from "@/lib/verification-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readParams(context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await context.params;
  return params.id;
}

async function proxyRequest(request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  const id = await readParams(context);
  return handleEmbeddedVerificationProxyRequest(id, request);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  return proxyRequest(request, context);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  return proxyRequest(request, context);
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  return proxyRequest(request, context);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  return proxyRequest(request, context);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  return proxyRequest(request, context);
}

export async function OPTIONS(request: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  return proxyRequest(request, context);
}
