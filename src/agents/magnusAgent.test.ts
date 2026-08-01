import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.hoisted(() => vi.fn());
const readCalendarMock = vi.hoisted(() => vi.fn());
const createEventMock = vi.hoisted(() => vi.fn());
const logNoteMock = vi.hoisted(() => vi.fn());
const updateEventMock = vi.hoisted(() => vi.fn());
const deleteEventMock = vi.hoisted(() => vi.fn());
const planEventMock = vi.hoisted(() => vi.fn());
const listEventsMock = vi.hoisted(() => vi.fn());
const setEventStatusMock = vi.hoisted(() => vi.fn());
const rescheduleLoggedMock = vi.hoisted(() => vi.fn());
const activityStatsMock = vi.hoisted(() => vi.fn());
const dropEventMock = vi.hoisted(() => vi.fn());

vi.mock("../tools/clients.js", () => ({
  anthropic: { messages: { create: createMock } },
  supabase: {},
  redis: {},
}));

vi.mock("./tools/calendarTool.js", () => ({
  readCalendarEvents: readCalendarMock,
  createCalendarEvent: createEventMock,
  updateCalendarEvent: updateEventMock,
  deleteCalendarEvent: deleteEventMock,
}));

vi.mock("./tools/logNoteTool.js", () => ({
  logNote: logNoteMock,
}));

vi.mock("./tools/eventTool.js", () => ({
  planEvent: planEventMock,
  listEvents: listEventsMock,
  setEventStatus: setEventStatusMock,
  rescheduleEvent: rescheduleLoggedMock,
  summariseActivity: activityStatsMock,
  dropEvent: dropEventMock,
}));

vi.mock("./memory/memoryAgent.js", () => ({
  buildAgentMessages: (_ctx: unknown, content: string) => [{ role: "user" as const, content }],
  augmentUserWithMemory: (msg: string) => msg,
}));

import { runMagnusAgent } from "./magnusAgent.js";

const CTX = {
  userProfileId: "00000000-0000-0000-0000-000000000001",
  telegramUserId: "1",
  timezone: "Asia/Kolkata",
  rawMessage: "what does my day look like?",
  intent: "GENERAL" as const,
};

function textReply(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function toolReply(name: string, input: Record<string, unknown>) {
  return {
    content: [
      { type: "tool_use" as const, id: "tool_1", name, input },
    ],
  };
}

describe("runMagnusAgent", () => {
  beforeEach(() => {
    createMock.mockReset();
    readCalendarMock.mockReset();
    createEventMock.mockReset();
    logNoteMock.mockReset();
    updateEventMock.mockReset();
    deleteEventMock.mockReset();
    planEventMock.mockReset();
    listEventsMock.mockReset();
    setEventStatusMock.mockReset();
    rescheduleLoggedMock.mockReset();
    activityStatsMock.mockReset();
    dropEventMock.mockReset();
  });

  it("answers directly when no tool is needed", async () => {
    createMock.mockResolvedValueOnce(textReply("Nothing on today."));

    const out = await runMagnusAgent(CTX);

    expect(out.text).toBe("Nothing on today.");
    expect(out.metadata.specialist).toBe("Magnus");
    expect(out.metadata.tools_used).toBeUndefined();
    expect(readCalendarMock).not.toHaveBeenCalled();
  });

  it("reads the calendar, then answers using the result", async () => {
    readCalendarMock.mockResolvedValue("- Mon 28 Jul 09:00–10:00 — Standup");
    createMock
      .mockResolvedValueOnce(toolReply("read_calendar", { start_iso: "2026-07-28T00:00:00Z" }))
      .mockResolvedValueOnce(textReply("One thing: standup at 9."));

    const out = await runMagnusAgent(CTX);

    expect(readCalendarMock).toHaveBeenCalledWith(
      expect.objectContaining({ timeZone: "Asia/Kolkata" }),
    );
    expect(out.text).toBe("One thing: standup at 9.");
    expect(out.metadata.tools_used).toEqual(["read_calendar"]);
  });

  it("passes the user's timezone when creating an event", async () => {
    createEventMock.mockResolvedValue('Created "Gym" — Tue 28 Jul 07:00–08:00.');
    createMock
      .mockResolvedValueOnce(
        toolReply("create_calendar_event", {
          summary: "Gym",
          start_iso: "2026-07-28T07:00:00",
          end_iso: "2026-07-28T08:00:00",
        }),
      )
      .mockResolvedValueOnce(textReply("Booked gym for 7am."));

    const out = await runMagnusAgent({ ...CTX, rawMessage: "book gym 7am tomorrow" });

    expect(createEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ summary: "Gym", timeZone: "Asia/Kolkata" }),
    );
    expect(out.text).toBe("Booked gym for 7am.");
  });

  it("moves an event by id, forwarding only the changed field", async () => {
    updateEventMock.mockResolvedValue('Updated "Gym" — now Tue 28 Jul 08:00–09:00.');
    createMock
      .mockResolvedValueOnce(
        toolReply("update_calendar_event", {
          event_id: "evt_1",
          start_iso: "2026-07-28T08:00:00",
        }),
      )
      .mockResolvedValueOnce(textReply("Moved gym to 8am."));

    const out = await runMagnusAgent({ ...CTX, rawMessage: "move gym to 8am" });

    expect(updateEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt_1",
        startIso: "2026-07-28T08:00:00",
        endIso: undefined,
        timeZone: "Asia/Kolkata",
      }),
    );
    expect(out.text).toBe("Moved gym to 8am.");
    expect(out.metadata.tools_used).toEqual(["update_calendar_event"]);
  });

  it("deletes an event by id", async () => {
    deleteEventMock.mockResolvedValue('Deleted "Swimming" (was Tue 28 Jul 19:00–20:00).');
    createMock
      .mockResolvedValueOnce(toolReply("delete_calendar_event", { event_id: "evt_2" }))
      .mockResolvedValueOnce(textReply("Cancelled swimming on Tuesday."));

    const out = await runMagnusAgent({ ...CTX, rawMessage: "cancel swimming tuesday" });

    expect(deleteEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt_2", timeZone: "Asia/Kolkata" }),
    );
    expect(out.text).toBe("Cancelled swimming on Tuesday.");
  });

  it("never leaks an event id into the reply", async () => {
    readCalendarMock.mockResolvedValue("- Tue 28 Jul 19:00–20:00 — Swimming [id: evt_2]");
    createMock
      .mockResolvedValueOnce(toolReply("read_calendar", {}))
      .mockResolvedValueOnce(textReply("Swimming at 7pm tomorrow."));

    const out = await runMagnusAgent(CTX);

    expect(out.text).not.toContain("evt_2");
    expect(out.text).not.toMatch(/\[id:/);
  });

  it("logs a note with the profile id", async () => {
    logNoteMock.mockResolvedValue("Logged for 2026-07-27.");
    createMock
      .mockResolvedValueOnce(toolReply("log_note", { text: "Dropped the side project." }))
      .mockResolvedValueOnce(textReply("Noted."));

    await runMagnusAgent({ ...CTX, rawMessage: "I've decided to drop the side project" });

    expect(logNoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userProfileId: CTX.userProfileId,
        text: "Dropped the side project.",
      }),
    );
  });

  it("reports a tool failure to the model instead of throwing", async () => {
    readCalendarMock.mockRejectedValue(new Error("calendar down"));
    createMock
      .mockResolvedValueOnce(toolReply("read_calendar", {}))
      .mockResolvedValueOnce(textReply("I couldn't reach your calendar."));

    const out = await runMagnusAgent(CTX);

    expect(out.text).toBe("I couldn't reach your calendar.");
    const secondCall = createMock.mock.calls[1]?.[0] as {
      messages: { role: string; content: unknown }[];
    };
    expect(JSON.stringify(secondCall.messages)).toContain("calendar down");
  });

  it("gives up cleanly if the model keeps calling tools", async () => {
    readCalendarMock.mockResolvedValue("no events");
    createMock.mockResolvedValue(toolReply("read_calendar", {}));

    const out = await runMagnusAgent(CTX);

    expect(out.metadata.tool_limit).toBe(true);
    expect(out.text).toContain("one thing at a time");
  });

  it("logs a commitment against the profile, in the profile's timezone", async () => {
    planEventMock.mockResolvedValue('Logged: "AI session" — Sat 1 Aug 21:00 [wisdom] [id: e1]');
    createMock
      .mockResolvedValueOnce(
        toolReply("log_event", {
          title: "AI session",
          pillar: "wisdom",
          start_iso: "2026-08-01T21:00:00",
          duration_minutes: 90,
          tags: ["deep-work"],
        }),
      )
      .mockResolvedValueOnce(textReply("Locked in for 9."));

    const out = await runMagnusAgent({ ...CTX, rawMessage: "locking in an AI session at 9pm" });

    expect(planEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userProfileId: CTX.userProfileId,
        timeZone: "Asia/Kolkata",
        title: "AI session",
        pillar: "wisdom",
        startIso: "2026-08-01T21:00:00",
        durationMinutes: 90,
        tags: ["deep-work"],
      }),
    );
    expect(out.text).toBe("Locked in for 9.");
    expect(out.metadata.tools_used).toEqual(["log_event"]);
  });

  it("moves a commitment through the reschedule tool, not by editing it", async () => {
    listEventsMock.mockResolvedValue("- Sat 1 Aug 21:00 — AI session [wisdom] (planned) [id: e1]");
    rescheduleLoggedMock.mockResolvedValue(
      'Postponed "AI session" from Sat 1 Aug 21:00 to Sat 1 Aug 23:00. [id: e2]',
    );
    createMock
      .mockResolvedValueOnce(toolReply("read_events", {}))
      .mockResolvedValueOnce(
        toolReply("reschedule_event", {
          event_id: "e1",
          new_start_iso: "2026-08-01T23:00:00",
          reason: "Dinner ran long",
        }),
      )
      .mockResolvedValueOnce(textReply("Moved it to 11."));

    const out = await runMagnusAgent({ ...CTX, rawMessage: "push the AI session to 11" });

    expect(rescheduleLoggedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "e1",
        newStartIso: "2026-08-01T23:00:00",
        reason: "Dinner ran long",
        timeZone: "Asia/Kolkata",
      }),
    );
    expect(out.text).toBe("Moved it to 11.");
    expect(out.metadata.tools_used).toEqual(["read_events", "reschedule_event"]);
  });

  it("drops arguments the model made up rather than passing junk down", async () => {
    planEventMock.mockResolvedValue("Logged.");
    createMock
      .mockResolvedValueOnce(
        toolReply("log_event", {
          title: "Gym",
          duration_minutes: "forty five",
          tags: "cardio",
          all_day: "yes",
        }),
      )
      .mockResolvedValueOnce(textReply("Done."));

    await runMagnusAgent({ ...CTX, rawMessage: "gym tomorrow" });

    const arg = planEventMock.mock.calls[0][0];
    expect(arg.durationMinutes).toBeUndefined();
    expect(arg.tags).toBeUndefined();
    expect(arg.allDay).toBeUndefined();
  });
});
