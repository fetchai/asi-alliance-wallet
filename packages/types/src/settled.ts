export type SettledResponse<T> =
  | {
      status: "fulfilled";
      value: T;
    }
  | {
      status: "rejected";
      reason: Error;
    };

export type SettledResponses<T> = SettledResponse<T>[];

/**
 * Promise.allSettled Error reasons lose non-enumerable fields (message) when
 * passed through extension JSON messaging, becoming `{}` / `[object Object]`.
 * Convert to a plain enumerable shape before returning from background.
 */
export function toSerializableSettledResponses<T>(
  results: PromiseSettledResult<T>[]
): SettledResponses<T> {
  return results.map((result) => {
    if (result.status === "fulfilled") {
      return {
        status: "fulfilled" as const,
        value: result.value,
      };
    }

    const err = result.reason;
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
        ? err
        : err && typeof err.message === "string"
        ? err.message
        : "Unknown error";

    const reason = {
      message,
      name: err instanceof Error ? err.name : "Error",
    } as Error & { module?: string; code?: number };

    if (err && typeof err === "object") {
      if (typeof (err as { module?: unknown }).module === "string") {
        reason.module = (err as { module: string }).module;
      }
      if (typeof (err as { code?: unknown }).code === "number") {
        reason.code = (err as { code: number }).code;
      }
    }

    return {
      status: "rejected" as const,
      reason,
    };
  });
}
