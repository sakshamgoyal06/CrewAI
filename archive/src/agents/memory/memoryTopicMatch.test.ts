import { describe, expect, it } from "vitest";

import type { MemoryTopicRow } from "./memoryTopics.js";
import {
  FORGET_MATCH_MIN_SCORE,
  forgetQueryTokens,
  normalizeMemoryMatchText,
  rankTopicsForForgetQuery,
  resolveForgetMatches,
  scoreTopicForgetMatch,
  topicMatchesForgetQuery,
} from "./memoryTopicMatch.js";

function topic(overrides: Partial<MemoryTopicRow> & Pick<MemoryTopicRow, "topic_key" | "label" | "body">): MemoryTopicRow {
  return {
    id: "1",
    user_profile_id: "u1",
    source: "user",
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("normalizeMemoryMatchText", () => {
  it("folds UK spellings and strips punctuation", () => {
    expect(normalizeMemoryMatchText("my favourite colour!")).toBe("my favorite color");
    expect(normalizeMemoryMatchText("don't eat peanuts")).toBe("dont eat peanuts");
  });
});

describe("forgetQueryTokens", () => {
  it("removes stop words", () => {
    expect(forgetQueryTokens("my favourite color")).toEqual(["favorite", "color"]);
    expect(forgetQueryTokens("forget about the gym schedule")).toEqual(["gym", "schedule"]);
  });
});

describe("scoreTopicForgetMatch", () => {
  const colorTopic = topic({
    topic_key: "preference:my_favorite_color_is_black",
    label: "my favorite color is black",
    body: "my favorite color is black",
  });

  it("matches UK spelling and partial phrases", () => {
    const match = scoreTopicForgetMatch(colorTopic, "my favourite color");
    expect(match.signals.phrase).toBe(1);
    expect(match.score).toBeGreaterThanOrEqual(FORGET_MATCH_MIN_SCORE);
    expect(topicMatchesForgetQuery(colorTopic, "my favourite color")).toBe(true);
  });

  it("matches plural variants", () => {
    const peanutTopic = topic({
      topic_key: "rule:allergic_to_peanuts",
      label: "Allergic to peanuts",
      body: "Allergic to peanuts",
    });
    expect(topicMatchesForgetQuery(peanutTopic, "peanut")).toBe(true);
  });

  it("matches topic key slug fragments", () => {
    expect(topicMatchesForgetQuery(colorTopic, "favorite color")).toBe(true);
  });

  it("does not match unrelated single-token queries", () => {
    expect(topicMatchesForgetQuery(colorTopic, "swimming")).toBe(false);
  });

  it("matches single distinctive tokens anchored in label", () => {
    const laukiTopic = topic({
      topic_key: "rule:never_eat_lauki",
      label: "I hate lauki",
      body: "I hate lauki",
    });
    expect(topicMatchesForgetQuery(laukiTopic, "lauki")).toBe(true);
  });
});

describe("resolveForgetMatches", () => {
  const gymMorning = topic({
    topic_key: "schedule:gym_morning",
    label: "Gym on Monday mornings",
    body: "Gym on Monday mornings at 7am",
  });
  const gymEvening = topic({
    topic_key: "schedule:gym_evening",
    label: "Gym on Monday evenings",
    body: "Gym on Monday evenings at 7pm",
  });

  it("returns clear when one topic dominates", () => {
    const ranked = rankTopicsForForgetQuery([gymMorning, gymEvening], "gym morning");
    const resolved = resolveForgetMatches(ranked);
    expect(resolved.status).toBe("clear");
    if (resolved.status === "clear") {
      expect(resolved.matches[0]?.topic.topic_key).toBe("schedule:gym_morning");
    }
  });

  it("returns ambiguous when multiple topics score similarly", () => {
    const jobMl = topic({
      topic_key: "goal:job_search_ml",
      label: "Job search focused on ML roles",
      body: "Job search focused on ML roles only",
    });
    const jobFe = topic({
      topic_key: "goal:job_search_frontend",
      label: "Job search includes frontend roles",
      body: "Job search includes frontend roles",
    });
    const ranked = rankTopicsForForgetQuery([jobMl, jobFe], "job search");
    const resolved = resolveForgetMatches(ranked);
    expect(resolved.status).toBe("ambiguous");
  });

  it("returns none when nothing matches", () => {
    const ranked = rankTopicsForForgetQuery([gymMorning], "portfolio holdings");
    expect(resolveForgetMatches(ranked)).toEqual({ status: "none" });
  });
});

describe("semantic boost", () => {
  it("can match via embedding similarity when keywords are weak", () => {
    const thailandTopic = topic({
      topic_key: "fact:thailand_trip",
      label: "Thailand trip late September Koh Samui",
      body: "Thailand trip late September Koh Samui first day",
    });
    const match = scoreTopicForgetMatch(thailandTopic, "southeast asia vacation", 0.82);
    expect(match.signals.semantic).toBe(0.82);
    expect(match.score).toBeGreaterThanOrEqual(FORGET_MATCH_MIN_SCORE);
  });
});
