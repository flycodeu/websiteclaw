import { ApiResponse } from "./types";

export function withTraceId<T>(data: T, message = "成功"): ApiResponse<T> {
  return {
    code: 0,
    message,
    traceId: `trace_${Math.random().toString(36).slice(2, 10)}`,
    data
  };
}
