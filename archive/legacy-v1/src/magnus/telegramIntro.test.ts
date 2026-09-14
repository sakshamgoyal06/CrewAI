import { describe, expect, it } from "vitest";

import {
  buildHelpMessage,
  buildStartMessage,
  isHelpCommand,
  isStartCommand,
} from "./telegramIntro.js";

describe("command triggers", () => {
  it("matches bare commands, including @botname and stray whitespace", () => {
    expect(isStartCommand("/start")).toBe(true);
    expect(isStartCommand("  /Start  ")).toBe(true);
    expect(isHelpCommand("/help@MagnusLifeOsBot")).toBe(true);
  });

  it("ignores commands with a payload or unrelated text", () => {
    expect(isStartCommand("/start now")).toBe(false);
    expect(isHelpCommand("help me plan the week")).toBe(false);
  });
});

describe("intro copy", () => {
  it("tells the user to write plainly rather than pick a lane", () => {
    const start = buildStartMessage();
    expect(start).toContain("/help");
    expect(start.toLowerCase()).toContain("no commands");
  });

  it("gives worked examples across the pillars without naming agents", () => {
    const help = buildHelpMessage();
    for (const cue of ["Calendar", "Health", "Money", "Learning", "Downtime", "YouTube"]) {
      expect(help).toContain(cue);
    }
    expect(help).not.toMatch(/specialist|agent|pillar|route/i);
  });

  it("advertises no slash commands at all — there are none to learn", () => {
    expect(buildHelpMessage()).not.toMatch(/^\/[a-z]/m);
  });
});
