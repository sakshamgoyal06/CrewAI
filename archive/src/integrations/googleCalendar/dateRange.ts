/** Default list window: now → +7 days (UTC ISO). */
export function defaultEventWindow(): { timeMin: string; timeMax: string } {
  const now = new Date();
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
  };
}

export function dayBoundsUtc(dateYmd: string): { timeMin: string; timeMax: string } {
  const start = new Date(`${dateYmd}T00:00:00.000Z`);
  const end = new Date(`${dateYmd}T23:59:59.999Z`);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}
