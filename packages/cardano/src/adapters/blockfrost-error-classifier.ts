const RATE_LIMIT_HTTP_STATUSES = new Set([402, 429]);

const RATE_LIMIT_MESSAGE_HINTS = [
  "rate limit",
  "rate-limit",
  "too many requests",
  "quota",
  "usage limit",
  "usage quota",
  "project limit",
];

export function isBlockfrostRateLimitHttpStatus(
  status: number | "unknown" | "ok" | undefined
): boolean {
  return typeof status === "number" && RATE_LIMIT_HTTP_STATUSES.has(status);
}

const collectErrorStrings = (error: unknown): string[] => {
  if (error == null) {
    return [];
  }

  if (typeof error === "string") {
    return [error];
  }

  if (error instanceof Error) {
    return [error.message, error.name];
  }

  const record = error as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ["message", "details", "reason", "code"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      parts.push(value);
    }
  }

  const response = record["response"] as
    | { data?: { message?: unknown } }
    | undefined;
  const responseMessage = response?.data?.message;
  if (typeof responseMessage === "string" && responseMessage.trim()) {
    parts.push(responseMessage);
  }

  return parts;
};

export function isBlockfrostRateLimitMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return RATE_LIMIT_MESSAGE_HINTS.some((hint) => normalized.includes(hint));
}

/**
 * Detect Blockfrost quota / rate-limit failures using HTTP status and error text.
 */
export function isBlockfrostRateLimitError(error: unknown): boolean {
  if (isBlockfrostRateLimitHttpStatus((error as { status?: number })?.status)) {
    return true;
  }

  const statusCode =
    (error as { statusCode?: number })?.statusCode ??
    (error as { response?: { status?: number } })?.response?.status;
  if (isBlockfrostRateLimitHttpStatus(statusCode)) {
    return true;
  }

  return collectErrorStrings(error).some(isBlockfrostRateLimitMessage);
}
