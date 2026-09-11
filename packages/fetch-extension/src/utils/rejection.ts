export function getRejectionMessage(reason: unknown): string {
  if (!reason) {
    return "";
  }
  if (typeof reason === "string") {
    return reason;
  }
  if (typeof reason === "object") {
    const message = (reason as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  if (reason instanceof Error) {
    return reason.message || "";
  }
  return "";
}

export function isKeyRingRejection(reason: unknown, code: number): boolean {
  if (!reason || typeof reason !== "object") {
    return false;
  }
  const r = reason as { module?: unknown; code?: unknown };
  return r.module === "keyring" && r.code === code;
}
