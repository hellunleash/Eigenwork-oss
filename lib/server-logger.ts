import { randomUUID } from "crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown> & {
  requestId?: string;
  userId?: string;
  jobId?: string;
  candidateId?: string;
  opId?: string;
  route?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function safeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  return { error: String(err) };
}

export function getRequestId(headers: Headers): string {
  const existing = headers.get("x-request-id")?.trim();
  return existing && existing.length > 0 ? existing : randomUUID();
}

export function log(level: LogLevel, message: string, ctx: LogContext = {}, err?: unknown) {
  const payload: Record<string, unknown> = {
    ts: nowIso(),
    level,
    msg: message,
    ...ctx,
    ...(err != null ? { err: safeError(err) } : {}),
  };

  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function timeMs() {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}

