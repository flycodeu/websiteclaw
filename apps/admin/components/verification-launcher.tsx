"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface VerificationWorkspaceState {
  active: boolean;
  stale?: boolean;
  currentUrl: string;
  embedUrl: string;
  lastUpdatedAt: string;
  errorMessage?: string;
}

function readErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") {
    return payload.message;
  }

  return fallback;
}

function readWorkspace(payload: unknown) {
  if (payload && typeof payload === "object" && "data" in payload) {
    return payload.data as VerificationWorkspaceState | null | undefined;
  }

  return null;
}

export function VerificationLauncher({ taskId, sourceName }: { taskId: string; sourceName: string }) {
  const [workspace, setWorkspace] = useState<VerificationWorkspaceState | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("正在连接真实 Chrome 会话...");

  const screenshotUrl =
    workspace?.active && !workspace?.embedUrl
      ? `/api/tasks/${taskId}/verification/screenshot?ts=${encodeURIComponent(String(previewNonce))}`
      : null;

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function launch() {
      try {
        const startResponse = await fetch(`/api/tasks/${taskId}/verification/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allowEmbeddedFallback: false })
        });
        const startPayload = (await startResponse.json().catch(() => null)) as unknown;

        if (!startResponse.ok) {
          throw new Error(readErrorMessage(startPayload, "启动人工验证失败"));
        }

        const pollWorkspace = async (silent = false) => {
          const workspaceResponse = await fetch(`/api/tasks/${taskId}/verification/session`, {
            cache: "no-store"
          });
          const workspacePayload = (await workspaceResponse.json().catch(() => null)) as unknown;

          if (!workspaceResponse.ok) {
            throw new Error(readErrorMessage(workspacePayload, "读取人工验证状态失败"));
          }

          const nextWorkspace = readWorkspace(workspacePayload);

          if (!cancelled) {
            setWorkspace(nextWorkspace ?? null);
            if (!silent) {
              setErrorMessage("");
              setStatusMessage(nextWorkspace?.active ? "已连接真实 Chrome，会话正在等待人工验证。" : "会话已连接。");
            }
          }
        };

        await pollWorkspace();
        timer = window.setInterval(() => {
          void pollWorkspace(true).catch(() => undefined);
          if (!cancelled) {
            setPreviewNonce((current) => current + 1);
          }
        }, 2500);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "人工验证启动失败");
          setStatusMessage("启动失败");
        }
      }
    }

    void launch();

    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearInterval(timer);
      }
    };
  }, [taskId]);

  return (
    <div className="min-h-[calc(100vh-140px)] px-0 py-0">
      <div className="grid min-h-[calc(100vh-140px)] gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-[30px] border border-[#d8cfbf] bg-white/90 p-6 shadow-[0_22px_56px_rgba(24,34,44,0.10)]">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Manual Verification</div>
          <h1 className="mt-3 font-serif text-3xl text-[#18222c]">{sourceName}</h1>
          <div className="mt-4 rounded-[20px] border border-[#d8cfbf] bg-[#f6f1e7] px-4 py-4 text-sm leading-6 text-slate-700">
            {statusMessage}
          </div>

          {errorMessage ? (
            <div className="mt-4 rounded-[20px] border border-[#f8ddd2] bg-[#fbede7] px-4 py-4 text-sm leading-6 text-[#9a4b33]">
              {errorMessage}
            </div>
          ) : null}

          {workspace?.currentUrl ? (
            <div className="mt-4 rounded-[20px] border border-[#d8cfbf] bg-white px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">当前地址</div>
              <div className="mt-2 break-all text-sm leading-6 text-slate-700">{workspace.currentUrl}</div>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => window.location.reload()} className="rounded-full bg-[#355344] px-5 py-3 text-sm text-white">
              刷新
            </button>
            <Link href="/tasks" className="rounded-full border border-[#d8cfbf] bg-white px-5 py-3 text-sm text-slate-700">
              返回任务
            </Link>
          </div>
        </aside>

        <section className="rounded-[30px] border border-[#d8cfbf] bg-[#0d151d] shadow-[0_22px_56px_rgba(24,34,44,0.10)]">
          <div className="border-b border-white/10 px-5 py-4 text-white">
            <div className="text-[11px] uppercase tracking-[0.16em] text-white/56">Live Preview</div>
            <h2 className="mt-2 text-xl font-semibold text-white">真实验证窗口预览</h2>
          </div>

          <div className="p-4 sm:p-5">
            {screenshotUrl ? (
              <img
                key={screenshotUrl}
                src={screenshotUrl}
                alt="当前验证页预览"
                className="h-[78vh] w-full rounded-[22px] border border-white/10 bg-[#111a23] object-contain"
              />
            ) : (
              <div className="flex h-[78vh] items-center justify-center rounded-[22px] border border-dashed border-white/12 px-8 text-center text-sm text-white/54">
                正在等待 Chrome 会话就绪
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
