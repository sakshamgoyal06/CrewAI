import type { FiMoneyValue } from "./types.js";

export function fiMoneyToInr(value?: FiMoneyValue | null): number | undefined {
  if (!value?.units && value?.units !== "0") {
    if (value?.nanos == null) {
      return undefined;
    }
  }
  const units = Number.parseFloat(String(value?.units ?? "0"));
  const nanos = Number(value?.nanos ?? 0) / 1_000_000_000;
  if (Number.isNaN(units)) {
    return undefined;
  }
  return units + nanos;
}
