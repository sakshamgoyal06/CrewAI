import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FcmError, fcmConfig, fcmSender, isFcmEndpoint, resetFcmAuthCache } from "./fcm.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const cfg = { projectId: "magnus-test", clientEmail: "push@magnus-test.iam.gserviceaccount.com", privateKey: pem };

function fakeFetch(sendStatus = 200, sendBody = "{}") {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith("https://oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }), { status: 200 });
    }
    void init;
    return new Response(sendBody, { status: sendStatus });
  });
}

describe("fcm", () => {
  beforeEach(() => resetFcmAuthCache());

  it("reads the service account raw or base64, and nothing without it", () => {
    const json = JSON.stringify({ project_id: "p", client_email: "e@x", private_key: "k" });
    expect(fcmConfig({ MAGNUS_FCM_SERVICE_ACCOUNT: json })).toEqual({ projectId: "p", clientEmail: "e@x", privateKey: "k" });
    expect(fcmConfig({ MAGNUS_FCM_SERVICE_ACCOUNT: Buffer.from(json).toString("base64") })?.projectId).toBe("p");
    expect(fcmConfig({})).toBeNull();
    expect(fcmConfig({ MAGNUS_FCM_SERVICE_ACCOUNT: "{not json" })).toBeNull();
  });

  it("tells app installs from web push subscriptions", () => {
    expect(isFcmEndpoint("fcm:abc")).toBe(true);
    expect(isFcmEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(false);
  });

  it("sends a high-priority data message with string values, reusing the access token", async () => {
    const f = fakeFetch();
    const send = fcmSender(cfg, f as unknown as typeof fetch);
    await send("fcm:device-token", JSON.stringify({ id: "n1", title: "Lunch", body: "Dal and rice", url: "/app/", tag: "plan_meal" }));
    await send("fcm:device-token", JSON.stringify({ id: "n2", title: "Walk", body: "7 pm", tag: "routine_reminder" }));
    const calls = f.mock.calls.map((c) => String(c[0]));
    expect(calls.filter((u) => u.includes("oauth2")).length).toBe(1);
    const sendCall = f.mock.calls.find((c) => String(c[0]).includes("messages:send"))!;
    expect(String(sendCall[0])).toBe("https://fcm.googleapis.com/v1/projects/magnus-test/messages:send");
    const body = JSON.parse(String(sendCall[1]?.body));
    expect(body.message.token).toBe("device-token");
    expect(body.message.android.priority).toBe("HIGH");
    expect(body.message.data).toEqual({ id: "n1", title: "Lunch", body: "Dal and rice", url: "/app/", tag: "plan_meal" });
  });

  it("marks an uninstalled app as gone (410) so its row is removed", async () => {
    const send = fcmSender(cfg, fakeFetch(404, '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}') as unknown as typeof fetch);
    await expect(send("fcm:old", "{}")).rejects.toMatchObject({ statusCode: 410 });
    const other = fcmSender(cfg, fakeFetch(500, "oops") as unknown as typeof fetch);
    await expect(other("fcm:x", "{}")).rejects.toBeInstanceOf(FcmError);
  });
});
