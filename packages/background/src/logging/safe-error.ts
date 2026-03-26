type LogContext = Record<string, unknown>;

const REDACTED_KEYS = [
  "password",
  "mnemonic",
  "privateKey",
  "seed",
  "signDoc",
  "serialized",
  "serializedAgent",
  "cardanoSerializedAgent",
  "runtimeSessionId",
  "unlockSessionId",
  "draft",
];

function shouldRedactKey(key: string): boolean {
  const lower = key.toLowerCase();
  return REDACTED_KEYS.some((token) => lower.includes(token.toLowerCase()));
}

export const formatErrorForLog = (error: unknown, context?: LogContext) => {
  const err = error instanceof Error ? error : new Error(String(error));
  const safeContext: LogContext = {};

  if (context) {
    for (const [key, value] of Object.entries(context)) {
      safeContext[key] = shouldRedactKey(key) ? "[REDACTED]" : value;
    }
  }

  return {
    name: err.name,
    message: err.message,
    context: safeContext,
  };
};
