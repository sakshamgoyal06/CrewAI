import type { Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  allowOAuthDiagnostics,
  autoAllowlistNewUsers,
  redisGuardFailOpen,
} from "./security.js";

function mockReq(auth?: string): Request {
  return {
    get: (name: string) => (name.toLowerCase() === "authorization" ? auth : undefined),
  } as Request;
}

function mockRes(): Response {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response;
}

describe("security config", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllEnvs();
  });

  it("autoAllowlistNewUsers defaults false when unset", () => {
    delete process.env.MAGNUS_AUTO_ALLOWLIST_NEW_USERS;
    expect(autoAllowlistNewUsers()).toBe(false);
  });

  it("autoAllowlistNewUsers true only when explicitly set", () => {
    process.env.MAGNUS_AUTO_ALLOWLIST_NEW_USERS = "true";
    expect(autoAllowlistNewUsers()).toBe(true);
  });

  it("redisGuardFailOpen is false in production by default", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.MAGNUS_REDIS_GUARD_FAIL_OPEN;
    expect(redisGuardFailOpen()).toBe(false);
  });

  it("redisGuardFailOpen is true in development by default", () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.MAGNUS_REDIS_GUARD_FAIL_OPEN;
    expect(redisGuardFailOpen()).toBe(true);
  });

  it("blocks OAuth diagnostics in production without bearer secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.MAGNUS_INTERNAL_JOB_SECRET;
    expect(allowOAuthDiagnostics(mockReq())).toBe(false);
  });

  it("allows OAuth diagnostics in production with matching bearer", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.MAGNUS_INTERNAL_JOB_SECRET = "ops-secret";
    expect(allowOAuthDiagnostics(mockReq("Bearer ops-secret"))).toBe(true);
  });

  it("allows OAuth diagnostics in development without auth", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(allowOAuthDiagnostics(mockReq())).toBe(true);
  });
});
