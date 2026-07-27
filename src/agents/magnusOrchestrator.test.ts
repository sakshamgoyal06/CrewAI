import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.hoisted(() =>
  vi.fn().mockImplementation(async () => ({
    content: [{ type: "text" as const, text: "GENERAL" }],
  })),
);

vi.mock("../tools/clients.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../tools/clients.js")>();
  return {
    ...mod,
    anthropic: {
      ...mod.anthropic,
      messages: {
        ...mod.anthropic.messages,
        create: createMock,
      },
    },
  };
});

vi.mock("./health/healthOnboarding.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./health/healthOnboarding.js")>();
  return {
    ...mod,
    fetchUserHealthProfile: vi.fn().mockResolvedValue(null),
  };
});

const { defaultMemoryPayload } = vi.hoisted(() => {
  const defaultMemoryPayload = {
    purpose: "chat" as const,
    loadedAt: new Date().toISOString(),
    profile: null,
    recentSignals: { recentChatTurns: [] },
    rollingSummaries: {},
    activeGoals: [],
    joy: {},
    patterns: [],
    gaps: [],
  };
  return { defaultMemoryPayload };
});

vi.mock("./memory/memoryAgent.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./memory/memoryAgent.js")>();
  return {
    ...mod,
    loadMemoryContext: vi.fn().mockResolvedValue(defaultMemoryPayload),
    formatMemoryBlockForSystem: vi.fn().mockReturnValue(""),
    augmentUserWithMemory: (msg: string, _block?: string) => msg,
    intentToMemoryPurpose: () => "chat" as const,
  };
});

import { loadMemoryContext } from "./memory/memoryAgent.js";
import { runOrchestratorReply } from "./magnusOrchestrator.js";

describe("runOrchestratorReply", () => {
  beforeEach(() => {
    createMock.mockReset();
    createMock.mockImplementation(async () => ({
      content: [{ type: "text" as const, text: "GENERAL" }],
    }));
    vi.mocked(loadMemoryContext).mockReset();
    vi.mocked(loadMemoryContext).mockResolvedValue(defaultMemoryPayload);
  });

  it("answers GENERAL via Claude general path (two API calls)", async () => {
    createMock
      .mockResolvedValueOnce({
        content: [{ type: "text" as const, text: "GENERAL" }],
      })
      .mockResolvedValueOnce({
        content: [{ type: "text" as const, text: "Warm reply." }],
      });

    const out = await runOrchestratorReply({
      userMessage: "How are you?",
      userProfileId: "p1",
      telegramUserId: "t1",
    });

    expect(out.intent).toBe("GENERAL");
    expect(out.replyText).toBe("Warm reply.");
    expect(out.delegatedAgent).toBeUndefined();
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("delegates WEALTH to Wealth composite when classifier returns WEALTH", async () => {
    createMock
      .mockResolvedValueOnce({
        content: [{ type: "text" as const, text: "WEALTH" }],
      })
      .mockResolvedValueOnce({
        content: [{ type: "text" as const, text: "Process coaching reply." }],
      });

    const out = await runOrchestratorReply({
      userMessage: "portfolio rebalance",
      userProfileId: "p1",
      telegramUserId: "t1",
    });

    expect(out.intent).toBe("WEALTH");
    expect(out.delegatedAgent).toBe("WealthComposite");
    expect(out.replyText).toContain("Process coaching");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("delegates PLANNING to Planner specialist", async () => {
    createMock
      .mockResolvedValueOnce({
        content: [{ type: "text" as const, text: "PLANNING" }],
      })
      .mockResolvedValueOnce({
        content: [{ type: "text" as const, text: "Planner coaching reply." }],
      });

    const out = await runOrchestratorReply({
      userMessage: "plan my week",
      userProfileId: "p1",
      telegramUserId: "t1",
    });

    expect(out.intent).toBe("PLANNING");
    expect(out.replyText).toBe("Planner coaching reply.");
    expect(out.delegatedAgent).toBe("Planner");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("skips classify and uses Planner when disambiguation follow-up is 1", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text" as const, text: "Planner from disambig." }],
    });

    const out = await runOrchestratorReply({
      userMessage: "Plan my week and research competitors",
      userProfileId: "p1",
      telegramUserId: "t1",
      disambiguationChoice: "1",
    });

    expect(out.intent).toBe("PLANNING");
    expect(out.delegatedAgent).toBe("Planner");
    expect(out.replyText).toBe("Planner from disambig.");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("skips classify and uses Research when disambiguation follow-up is 2", async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: "text" as const,
          text: "## Executive answer\nOk.\n## Key points\n- a\n## Sources\n- **T** — https://x — r.\n## Open questions / risks\n- n",
        },
      ],
    });

    const out = await runOrchestratorReply({
      userMessage: "Plan my week and research competitors",
      userProfileId: "p1",
      telegramUserId: "t1",
      disambiguationChoice: "2",
    });

    expect(out.intent).toBe("GENERAL");
    expect(out.delegatedAgent).toBe("Research");
    expect(out.replyText).toContain("Executive answer");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("routes research-style messages to Research even when classifier returns PLANNING", async () => {
    createMock
      .mockResolvedValueOnce({
        content: [{ type: "text" as const, text: "PLANNING" }],
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: "text" as const,
            text: "## Executive answer\nDisposal.\n## Key points\n- a\n## Sources\n- **T** — https://x — r.\n## Open questions / risks\n- n",
          },
        ],
      });

    const out = await runOrchestratorReply({
      userMessage: "Research services to dispose of a large wooden bed in HSR, Bangalore",
      userProfileId: "p1",
      telegramUserId: "t1",
    });

    expect(out.intent).toBe("GENERAL");
    expect(out.delegatedAgent).toBe("Research");
    expect(out.replyText).toContain("Executive answer");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("calls onBeforeDelegation before loadMemoryContext when delegating to a specialist", async () => {
    const order: string[] = [];
    vi.mocked(loadMemoryContext).mockImplementation(async () => {
      order.push("memory");
      return defaultMemoryPayload;
    });

    createMock
      .mockResolvedValueOnce({
        content: [{ type: "text" as const, text: "PLANNING" }],
      })
      .mockResolvedValueOnce({
        content: [{ type: "text" as const, text: "Planner coaching reply." }],
      });

    await runOrchestratorReply({
      userMessage: "plan my week",
      userProfileId: "p1",
      telegramUserId: "t1",
      onBeforeDelegation: async () => {
        order.push("before");
      },
    });

    expect(order).toEqual(["before", "memory"]);
  });

  it("delegates GENERAL research sub-intent to Research", async () => {
    createMock
      .mockResolvedValueOnce({
        content: [{ type: "text" as const, text: "GENERAL" }],
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: "text" as const,
            text: "## Executive answer\nOk.\n## Key points\n- a\n## Sources\n- **T** — https://x — r.\n## Open questions / risks\n- n",
          },
        ],
      });

    const out = await runOrchestratorReply({
      userMessage: "research the latest on LLM evals",
      userProfileId: "p1",
      telegramUserId: "t1",
    });

    expect(out.intent).toBe("GENERAL");
    expect(out.delegatedAgent).toBe("Research");
    expect(out.replyText).toContain("Executive answer");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("delegates LEARNING to Learning Plan specialist", async () => {
    createMock
      .mockResolvedValueOnce({
        content: [{ type: "text" as const, text: "LEARNING" }],
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: "text" as const,
            text: "Sketch three milestones: ownership basics, borrowing rules, then lifetimes in APIs. Revisit each thread after a few days.",
          },
        ],
      });

    const out = await runOrchestratorReply({
      userMessage: "I want to learn about Rust lifetimes",
      userProfileId: "p1",
      telegramUserId: "t1",
    });

    expect(out.intent).toBe("LEARNING");
    expect(out.delegatedAgent).toBe("LearningPlan");
    expect(out.replyText).toContain("milestones");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("classifies then coerces Notion keyword phrases to NOTION and delegates to Notion agent", async () => {
    vi.stubEnv("NOTION_TOKEN", "");
    vi.stubEnv("NOTION_API_KEY", "");
    vi.stubEnv("NOTION_INTEGRATION_TOKEN", "");
    try {
      createMock.mockResolvedValueOnce({
        content: [{ type: "text" as const, text: "GENERAL" }],
      });

      const out = await runOrchestratorReply({
        userMessage: "log this to notion: reminder about taxes",
        userProfileId: "p1",
        telegramUserId: "t1",
      });

      expect(out.intent).toBe("NOTION");
      expect(out.delegatedAgent).toBe("Notion");
      expect(out.replyText).toMatch(/configured|NOTION_DAILY_LOG_PARENT_PAGE_ID/i);
      expect(createMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
