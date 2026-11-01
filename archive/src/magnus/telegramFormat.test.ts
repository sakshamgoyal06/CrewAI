import { describe, expect, it } from "vitest";

import { formatInline, markdownishToTelegramHtml } from "./telegramFormat.js";

describe("formatInline", () => {
  it("escapes HTML and wraps **bold**", () => {
    expect(formatInline("a <b> & **x**")).toBe(
      "a &lt;b&gt; &amp; <b>x</b>",
    );
  });

  it("converts [label](url) to anchor", () => {
    expect(formatInline("[T](https://ex.com/a)")).toBe(
      '<a href="https://ex.com/a">T</a>',
    );
  });
});

describe("markdownishToTelegramHtml", () => {
  it("renders plain lines without unsupported tags (no <p> or <br> — Telegram HTML)", () => {
    const h = markdownishToTelegramHtml("Hello world.");
    expect(h).not.toContain("<p>");
    expect(h).not.toMatch(/<br\/?>/i);
    expect(h).toContain("Hello world.");
  });

  it("joins continued paragraph lines with newlines, not br tags", () => {
    const h = markdownishToTelegramHtml("Line one\nLine two");
    expect(h).not.toMatch(/<br/i);
    expect(h).toContain("Line one");
    expect(h).toContain("Line two");
    expect(h).toContain("\n");
  });

  it("renders ## headings as bold", () => {
    const h = markdownishToTelegramHtml("## Title\n\nBody.");
    expect(h).toContain("<b>Title</b>");
    expect(h).toContain("Body");
  });

  it("renders bullet lines with •", () => {
    const h = markdownishToTelegramHtml("- one\n- two");
    expect(h).toContain("•");
    expect(h).toContain("one");
    expect(h).toContain("two");
  });
});
