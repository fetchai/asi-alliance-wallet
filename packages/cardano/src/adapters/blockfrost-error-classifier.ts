const QUOTA_EXCEEDED_HTTP_STATUSES = new Set([402]);

const QUOTA_EXCEEDED_MESSAGE_HINTS = [
  "quota",
  "usage limit",
  "usage quota",
  "project limit",
  "daily limit",
];

const BURST_THROTTLE_HTTP_STATUSES = new Set([429]);

export function isBlockfrostRateLimitHttpStatus(
  status: number | "unknown" | "ok" | undefined
): boolean {
  return typeof status === "number" && QUOTA_EXCEEDED_HTTP_STATUSES.has(status);
}

const getErrorStatus = (error: unknown): number | undefined => {
  const record = error as {
    status?: number;
    statusCode?: number;
    response?: { status?: number };
  };

  return record?.status ?? record?.statusCode ?? record?.response?.status;
};

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
  return QUOTA_EXCEEDED_MESSAGE_HINTS.some((hint) => normalized.includes(hint));
}

/**
 * Detect Blockfrost daily API key quota exhaustion (HTTP 402 and quota text).
 * Burst throttling (HTTP 429) is never treated as quota exceeded, even when
 * the error message contains generic "rate limit" wording.
 */
export function isBlockfrostRateLimitError(error: unknown): boolean {
  const status = getErrorStatus(error);

  if (typeof status === "number" && BURST_THROTTLE_HTTP_STATUSES.has(status)) {
    return false;
  }

  if (typeof status === "number" && QUOTA_EXCEEDED_HTTP_STATUSES.has(status)) {
    return true;
  }

  return collectErrorStrings(error).some(isBlockfrostRateLimitMessage);
}
