/** Scores one eval reply in code: tool calls, forbidden and required phrases, length, format. */
import type { EvalCase } from "./cases.js";

export function sentences(text: string): number {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim()).length;
}

export function score(c: EvalCase, reply: string, calls: Array<{ name: string; input: Record<string, unknown> }>): string[] {
  const reasons: string[] = [];
  const e = c.expect;
  if (e.noTools && calls.length) reasons.push(`called tools: ${calls.map((x) => x.name).join(", ")}`);
  for (const want of e.tools ?? []) {
    const hit = calls.find((x) => x.name === want.name && (!want.input || want.input(x.input)));
    if (!hit) reasons.push(`missing ${want.name}${want.input ? " with the expected input" : ""} (got ${calls.map((x) => `${x.name} ${JSON.stringify(x.input)}`).join("; ") || "no tools"})`);
  }
  for (const no of e.notTools ?? []) if (calls.some((x) => x.name === no)) reasons.push(`must not call ${no}`);
  for (const re of e.forbid ?? []) if (re.test(reply)) reasons.push(`reply matches forbidden ${re}`);
  for (const re of e.require ?? []) if (!re.test(reply)) reasons.push(`reply lacks ${re}`);
  const cap = e.maxSentences ?? 4;
  if (sentences(reply) > cap) reasons.push(`${sentences(reply)} sentences (cap ${cap})`);
  if (/^#|\n- |\n\* /m.test(reply)) reasons.push("headings or bullets");
  return reasons;
}
