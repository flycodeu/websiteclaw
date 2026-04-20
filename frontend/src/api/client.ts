import type {
  ExecutionProduct,
  ExecutionProductPayload,
  ExecutionProductUpdatePayload,
  ExecutionRecord,
  ExecutionRecordShareResponse,
  ExecutionRecordUpdatePayload,
  ManualSession,
  ManualSessionAction,
  Site,
  SitePayload,
  Snapshot,
  SystemInfo,
  SystemSettings,
  SystemSettingsPayload,
  TaskLog,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export class APIError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "APIError";
    this.status = status;
  }
}

async function requestText(path: string, init?: RequestInit): Promise<string> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new APIError(response.status, extractErrorMessage(errorText, "Request failed"));
  }

  return response.text();
}

function extractErrorMessage(rawText: string, fallback: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(trimmed) as { detail?: unknown };
    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail;
    }
  } catch {
    // Ignore non-JSON error payloads and fall through to the raw text.
  }

  return trimmed;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new APIError(response.status, extractErrorMessage(errorText, "Request failed"));
  }

  return response.json() as Promise<T>;
}

async function requestVoid(path: string, init?: RequestInit): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new APIError(response.status, extractErrorMessage(errorText, "Request failed"));
  }
}

export const api = {
  getSystemInfo: () => request<SystemInfo>("/system/info"),
  getSystemSettings: () => request<SystemSettings>("/system/settings"),
  updateSystemSettings: (payload: SystemSettingsPayload) =>
    request<SystemSettings>("/system/settings", { method: "PUT", body: JSON.stringify(payload) }),
  listSites: () => request<Site[]>("/sites"),
  createSite: (payload: SitePayload) =>
    request<Site>("/sites", { method: "POST", body: JSON.stringify(payload) }),
  updateSite: (siteId: number, payload: Partial<SitePayload>) =>
    request<Site>(`/sites/${siteId}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteSite: (siteId: number) => requestVoid(`/sites/${siteId}`, { method: "DELETE" }),
  triggerCrawl: (siteId: number) =>
    request<Snapshot>(`/sites/${siteId}/crawl`, { method: "POST" }),
  listSiteSnapshots: (siteId: number) => request<Snapshot[]>(`/sites/${siteId}/snapshots`),
  getSnapshot: (snapshotId: number) => request<Snapshot>(`/snapshots/${snapshotId}`),
  listTaskLogs: () => request<TaskLog[]>("/task-logs"),
  listRecords: (params?: {
    platform?: string;
    status?: string;
    manual_review_status?: string;
    accessible?: "true" | "false" | "";
    query?: string;
  }) => {
    const search = new URLSearchParams();
    if (params?.platform) search.set("platform", params.platform);
    if (params?.status) search.set("status", params.status);
    if (params?.manual_review_status) search.set("manual_review_status", params.manual_review_status);
    if (params?.accessible) search.set("accessible", params.accessible);
    if (params?.query) search.set("query", params.query);
    const suffix = search.size ? `?${search.toString()}` : "";
    return request<ExecutionRecord[]>(`/records${suffix}`);
  },
  getRecord: (recordId: number) => request<ExecutionRecord>(`/records/${recordId}`),
  updateRecord: (recordId: number, payload: ExecutionRecordUpdatePayload) =>
    request<ExecutionRecord>(`/records/${recordId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteRecord: (recordId: number) => requestVoid(`/records/${recordId}`, { method: "DELETE" }),
  clearRecords: () => requestVoid("/records", { method: "DELETE" }),
  addRecordProduct: (recordId: number, payload: ExecutionProductPayload) =>
    request<ExecutionProduct>(`/records/${recordId}/products`, { method: "POST", body: JSON.stringify(payload) }),
  updateProduct: (productId: number, payload: ExecutionProductUpdatePayload) =>
    request<ExecutionProduct>(`/products/${productId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  shareRecord: (recordId: number) =>
    request<ExecutionRecordShareResponse>(`/records/${recordId}/share`, { method: "POST" }),
  getSharedRecord: (shareToken: string) => request<ExecutionRecord>(`/shared-records/${shareToken}`),
  exportRecordsCsv: (recordId?: number) => {
    const suffix = typeof recordId === "number" ? `?record_id=${recordId}` : "";
    return requestText(`/records/export${suffix}`);
  },
  startManualSession: (snapshotId: number) =>
    request<ManualSession>(`/snapshots/${snapshotId}/manual-session/start`, { method: "POST" }),
  getManualSession: (snapshotId: number) => request<ManualSession>(`/snapshots/${snapshotId}/manual-session`),
  resumeManualSession: (sessionId: string) =>
    request<ManualSessionAction>(`/manual-sessions/${sessionId}/resume`, { method: "POST" }),
  cancelManualSession: (sessionId: string) =>
    request<ManualSessionAction>(`/manual-sessions/${sessionId}/cancel`, { method: "POST" }),
};
