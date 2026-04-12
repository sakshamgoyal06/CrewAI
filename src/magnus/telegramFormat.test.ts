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
  it("wraps plain lines in paragraphs", () => {
    const h = markdownishToTelegramHtml("Hello world.");
    expect(h).toContain("<p>");
    expect(h).toContain("Hello world.");
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
