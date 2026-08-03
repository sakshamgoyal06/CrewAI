import { describe, expect, it, vi } from "vitest";

vi.mock("./kiteEnv.js", () => ({
  kiteApiBaseUrl: () => "https://api.kite.trade",
  kiteFetchTimeoutMs: () => 5000,
}));

import { placeKiteMfOrder } from "./kiteClient.js";

describe("kiteClient write auth", () => {
  it("sends Authorization on POST /mf/orders", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("token test_key:test_token");
      expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
      return new Response(JSON.stringify({ status: "success", data: { order_id: "oid-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const res = await placeKiteMfOrder(
      { apiKey: "test_key", accessToken: "test_token" },
      { tradingsymbol: "INF000000000", transactionType: "BUY", amount: 100 },
      { fetchImpl },
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.order.order_id).toBe("oid-1");
    }
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
