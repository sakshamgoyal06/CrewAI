import { describe, expect, it } from "vitest";
import { createOpenAIShim, openaiModelFor, toAnthropicMessage, toOpenAIRequest } from "./openaiShim.js";

const env = { OPENAI_MODEL: "gpt-main", OPENAI_FAST_MODEL: "gpt-fast" } as NodeJS.ProcessEnv;

describe("openaiModelFor", () => {
  it("maps Haiku to the fast model and every other Claude model to the main one", () => {
    expect(openaiModelFor("claude-haiku-5-5", env)).toBe("gpt-fast");
    expect(openaiModelFor("claude-sonnet-5-5", env)).toBe("gpt-main");
    expect(openaiModelFor("gpt-4o", env)).toBe("gpt-4o");
  });
});

describe("toOpenAIRequest", () => {
  it("translates system, tool calls, tool results, images and tools", () => {
    const body = toOpenAIRequest(
      {
        model: "claude-sonnet-5-5",
        max_tokens: 100,
        system: [{ type: "text", text: "Be brief.", cache_control: { type: "ephemeral" } }],
        tools: [
          { name: "log_steps", description: "Save steps", input_schema: { type: "object", properties: {} }, cache_control: { type: "ephemeral" } },
          { type: "web_search_20250305", name: "web_search", max_uses: 2 },
        ],
        tool_choice: { type: "auto" },
        messages: [
          { role: "user", content: "I walked 5000 steps" },
          { role: "assistant", content: [{ type: "text", text: "Saving." }, { type: "tool_use", id: "tu_1", name: "log_steps", input: { steps: 5000 } }] },
          {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "tu_1", content: '{"ok":true}' },
              { type: "tool_result", tool_use_id: "tu_2", content: [{ type: "text", text: "boom" }], is_error: true },
              { type: "image", source: { type: "base64", media_type: "image/png", data: "AAA" } },
              { type: "text", text: "and this meal" },
            ],
          },
        ],
      },
      env,
    );
    expect(body.model).toBe("gpt-main");
    expect(body.max_completion_tokens).toBe(100);
    expect(body.tool_choice).toBeUndefined();
    expect(body.tools).toEqual([{ type: "function", function: { name: "log_steps", description: "Save steps", parameters: { type: "object", properties: {} } } }]);
    expect(body.messages).toEqual([
      { role: "system", content: "Be brief." },
      { role: "user", content: "I walked 5000 steps" },
      { role: "assistant", content: "Saving.", tool_calls: [{ id: "tu_1", type: "function", function: { name: "log_steps", arguments: '{"steps":5000}' } }] },
      { role: "tool", tool_call_id: "tu_1", content: '{"ok":true}' },
      { role: "tool", tool_call_id: "tu_2", content: "ERROR: boom" },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } },
          { type: "text", text: "and this meal" },
        ],
      },
    ]);
  });
});

describe("toAnthropicMessage", () => {
  it("turns tool calls into tool_use blocks", () => {
    const m = toAnthropicMessage(
      { message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "log_steps", arguments: '{"steps":10}' } }] }, finish_reason: "tool_calls" },
      { prompt_tokens: 12, completion_tokens: 3 },
      "gpt-main",
    );
    expect(m.stop_reason).toBe("tool_use");
    expect(m.content).toEqual([{ type: "tool_use", id: "c1", name: "log_steps", input: { steps: 10 } }]);
    expect(m.usage.input_tokens).toBe(12);
  });

  it("maps length and refusals", () => {
    expect(toAnthropicMessage({ message: { content: "partial" }, finish_reason: "length" }, undefined, "m").stop_reason).toBe("max_tokens");
    expect(toAnthropicMessage({ message: { content: null, refusal: "no" }, finish_reason: "stop" }, undefined, "m").stop_reason).toBe("refusal");
  });
});

function sse(lines: unknown[]): Response {
  const text = lines.map((l) => `data: ${typeof l === "string" ? l : JSON.stringify(l)}\n\n`).join("");
  return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); } }), { status: 200 });
}

describe("createOpenAIShim", () => {
  it("streams text deltas and assembles tool calls", async () => {
    const shim = createOpenAIShim({
      apiKey: "k",
      timeout: 5_000,
      maxRetries: 0,
      env,
      fetchFn: async () =>
        sse([
          { id: "x", model: "gpt-main", choices: [{ delta: { content: "Got " }, finish_reason: null }] },
          { choices: [{ delta: { content: "it." }, finish_reason: null }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "log_steps", arguments: '{"st' } }] }, finish_reason: null }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'eps":5}' } }] }, finish_reason: "tool_calls" }] },
          { choices: [], usage: { prompt_tokens: 7, completion_tokens: 4 } },
          "[DONE]",
        ]),
    });
    const deltas: string[] = [];
    const s = shim.beta.messages.stream({ model: "claude-sonnet-5-5", max_tokens: 50, messages: [{ role: "user", content: "hi" }], betas: ["x"], fallbacks: "default" });
    s.on("text", (d) => deltas.push(d));
    const m = await s.finalMessage();
    expect(deltas.join("")).toBe("Got it.");
    expect(m.stop_reason).toBe("tool_use");
    expect(m.content).toEqual([
      { type: "text", text: "Got it.", citations: null },
      { type: "tool_use", id: "c1", name: "log_steps", input: { steps: 5 } },
    ]);
    expect(m.usage.output_tokens).toBe(4);
  });

  it("does not retry an out-of-quota 429", async () => {
    let calls = 0;
    const shim = createOpenAIShim({
      apiKey: "k",
      timeout: 5_000,
      maxRetries: 2,
      fetchFn: async () => {
        calls += 1;
        return new Response('{"error":{"code":"insufficient_quota"}}', { status: 429 });
      },
    });
    await expect(shim.messages.create({ model: "claude-haiku-5-5", max_tokens: 5, messages: [] })).rejects.toThrow(/insufficient_quota/);
    expect(calls).toBe(1);
  });
});
