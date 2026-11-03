/**
 * Small fixed-window limiters kept in memory (one instance on Railway). They stop a flood, not a
 * determined attacker: failed sign-ins per IP (each unknown JWT costs a Supabase Auth call) and
 * writes per person.
 */
export class WindowLimiter {
  private readonly hits = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  /** True when `key` is over its limit in the current window (does not count a hit). */
  blocked(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    return !!h && now - h.start < this.windowMs && h.count >= this.max;
  }

  /** Counts one hit; true when this hit is within the limit. */
  take(key: string, now = Date.now()): boolean {
    let h = this.hits.get(key);
    if (!h || now - h.start >= this.windowMs) {
      if (this.hits.size >= this.maxKeys) this.prune(now);
      h = { start: now, count: 0 };
      this.hits.set(key, h);
    }
    h.count += 1;
    return h.count <= this.max;
  }

  private prune(now: number): void {
    for (const [k, h] of this.hits) if (now - h.start >= this.windowMs) this.hits.delete(k);
    if (this.hits.size >= this.maxKeys) this.hits.clear();
  }
}

/** Failed authentications per client IP: 30 a minute, then 429 until the window passes. */
export const failedAuthLimiter = new WindowLimiter(30, 60_000);

/** Requests per signed-in person: 240 a minute is far above any real use of the app. */
export const userRequestLimiter = new WindowLimiter(240, 60_000);
