import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../tools/chatLog.js", () => ({
  recordMagnusChatMessage: vi.fn().mockResolvedValue({ ok: true }),
}));

import { getLocalTimeParts } from "../jobs/morningBriefTime.js";
import { isMorningBriefTrigger } from "./morningBriefManual.js";
import {
  resetProactiveTelegramSendImplForTests,
  sendProactiveTelegram,
  setProactiveTelegramSendImplForTests,
} from "./outbound.js";
import { isInLocalHourWindow } from "./scheduleWindow.js";
import { recordMagnusChatMessage } from "../tools/chatLog.js";

describe("isInLocalHourWindow", () => {
  it("matches first window minutes of target hour", () => {
    const parts = { hour: 7, minute: 10, dateKey: "2026-08-02" };
    expect(isInLocalHourWindow(parts, 7, 14)).toBe(true);
    expect(isInLocalHourWindow(parts, 7, 10)).toBe(true);
    expect(isInLocalHourWindow({ ...parts, minute: 11 }, 7, 10)).toBe(false);
    expect(isInLocalHourWindow({ ...parts, hour: 8 }, 7, 14)).toBe(false);
  });
});

describe("isMorningBriefTrigger", () => {
  it("recognises plain and slash triggers", () => {
    expect(isMorningBriefTrigger("morning brief")).toBe(true);
    expect(isMorningBriefTrigger("/morningbrief")).toBe(true);
    expect(isMorningBriefTrigger("hello")).toBe(false);
  });
});

describe("sendProactiveTelegram", () => {
  afterEach(() => {
    resetProactiveTelegramSendImplForTests();
    vi.restoreAllMocks();
  });

  it("chunks and sends HTML without live Telegram", async () => {
    const sent: string[] = [];
    setProactiveTelegramSendImplForTests(async (html) => {
      sent.push(html);
    });

    await sendProactiveTelegram({
      chatId: "123",
      telegramUserIdForLog: "123",
      userProfileId: "00000000-0000-0000-0000-000000000001",
      plainText: "**Hi** there",
      kind: "morning_brief",
      trigger: "manual",
    });

    expect(sent.length).toBe(1);
    expect(sent[0]).toContain("<b>Hi</b>");
    expect(recordMagnusChatMessage).toHaveBeenCalled();
  });
});

describe("getLocalTimeParts integration", () => {
  it("stable date key for fixed instant", () => {
    const instant = new Date("2026-04-12T02:30:00.000Z");
    const p = getLocalTimeParts(instant, "Asia/Kolkata");
    expect(p.dateKey).toBe("2026-04-12");
  });
});
