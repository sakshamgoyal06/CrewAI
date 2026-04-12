/** Serialize errors for structured logs without dumping huge stacks by default. */
export function loggableError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const base: Record<string, unknown> = {
      name: err.name,
      message: err.message,
    };
    const any = err as Error & {
      code?: string;
      details?: string;
      hint?: string;
    };
    if (typeof any.code === "string") {
      base.code = any.code;
    }
    if (typeof any.details === "string") {
      base.details = any.details;
    }
    if (typeof any.hint === "string") {
      base.hint = any.hint;
    }
    return base;
  }
  return { value: String(err) };
}
