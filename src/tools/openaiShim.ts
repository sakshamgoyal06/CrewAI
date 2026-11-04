/**
 * A stand-in for the Anthropic client that runs on OpenAI Chat Completions, for when the
 * Anthropic account can't be used. It covers only what this server calls: `messages.create`,
 * `messages.stream` (with `on("text")` and `finalMessage()`), and the same two under `beta`.
 *
 * Requests and replies are translated so callers keep working with Anthropic shapes: tool_use /
 * tool_result blocks, images, stop reasons and usage. Anthropic-only features (prompt caching,
 * server-side fallback, the web_search server tool) are dropped.
 *
 * Switch on with MAGNUS_LLM_PROVIDER=openai and OPENAI_API_KEY. OPENAI_MODEL is used for every
 * Claude model except Haiku, which maps to OPENAI_FAST_MODEL.
 */
import type { Anthropic } from "@anthropic-ai/sdk";

type Env = NodeJS.ProcessEnv;

export type ShimOptions = { signal?: AbortSignal; timeout?: number; maxRetries?: number };

type OpenAIMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | Array<Record<string, unknown>> }
  | { role: "assistant"; content: string | null; tool_calls?: OpenAIToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type OpenAIToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

type OpenAIChoice = {
  message: { content: string | null; tool_calls?: OpenAIToolCall[]; refusal?: string | null };
  finish_reason: string | null;
};

type OpenAIUsage = { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };

export function openaiModelFor(model: string, env: Env = process.env): string {
  if (!model.startsWith("claude-")) return model;
  const main = env.OPENAI_MODEL?.trim() || "gpt-4.1";
  return model.startsWith("claude-haiku") ? env.OPENAI_FAST_MODEL?.trim() || "gpt-4.1-mini" : main;
}

function blocksText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b: { type?: string; text?: string }) => (b?.type === "text" && typeof b.text === "string" ? b.text : ""))
    .filter(Boolean)
    .join("\n");
}

function imagePart(block: { source?: { type?: string; media_type?: string; data?: string; url?: string } }) {
  const s = block.source ?? {};
  const url = s.type === "url" ? s.url : `data:${s.media_type ?? "image/jpeg"};base64,${s.data ?? ""}`;
  return { type: "image_url", image_url: { url } };
}

/** Anthropic request body → OpenAI Chat Completions body. */
export function toOpenAIRequest(params: Record<string, unknown>, env: Env = process.env): Record<string, unknown> {
  const out: OpenAIMessage[] = [];
  const system = blocksText(params.system);
  if (system) out.push({ role: "system", content: system });

  for (const m of (params.messages as Array<{ role: string; content: unknown }>) ?? []) {
    if (typeof m.content === "string") {
      out.push(m.role === "assistant" ? { role: "assistant", content: m.content } : { role: "user", content: m.content });
      continue;
    }
    const blocks = (m.content as Array<Record<string, unknown>>) ?? [];
    if (m.role === "assistant") {
      const text = blocks.filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join("\n");
      const calls: OpenAIToolCall[] = blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ id: String(b.id), type: "function", function: { name: String(b.name), arguments: JSON.stringify(b.input ?? {}) } }));
      out.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }
    // A user turn: tool results become `tool` messages (they must come first), the rest one user message.
    const parts: Array<Record<string, unknown>> = [];
    for (const b of blocks) {
      if (b.type === "tool_result") {
        const body = blocksText(b.content) || (typeof b.content === "string" ? b.content : "");
        out.push({ role: "tool", tool_call_id: String(b.tool_use_id), content: b.is_error ? `ERROR: ${body}` : body });
      } else if (b.type === "text") parts.push({ type: "text", text: String(b.text ?? "") });
      else if (b.type === "image") parts.push(imagePart(b as never));
    }
    if (parts.length) out.push({ role: "user", content: parts });
  }

  // Only client tools carry over; server tools (web_search and the like) have a `type` and no schema.
  const tools = ((params.tools as Array<Record<string, unknown>>) ?? [])
    .filter((t) => t.input_schema)
    .map((t) => ({
      type: "function",
      function: { name: String(t.name), description: String(t.description ?? ""), parameters: t.input_schema },
    }));

  const body: Record<string, unknown> = {
    model: openaiModelFor(String(params.model ?? ""), env),
    messages: out,
    max_completion_tokens: params.max_tokens,
  };
  if (typeof params.temperature === "number") body.temperature = params.temperature;
  if (tools.length) {
    body.tools = tools;
    const choice = params.tool_choice as { type?: string; name?: string } | undefined;
    if (choice?.type === "any") body.tool_choice = "required";
    else if (choice?.type === "tool" && choice.name) body.tool_choice = { type: "function", function: { name: choice.name } };
    else if (choice?.type === "none") body.tool_choice = "none";
  }
  return body;
}

function parseArgs(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** OpenAI choice → Anthropic Message. */
export function toAnthropicMessage(choice: OpenAIChoice, usage: OpenAIUsage | undefined, model: string, id = "msg_openai"): Anthropic.Message {
  const content: Array<Record<string, unknown>> = [];
  const text = choice.message.content ?? "";
  if (text) content.push({ type: "text", text, citations: null });
  for (const tc of choice.message.tool_calls ?? []) {
    content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input: parseArgs(tc.function.arguments) });
  }
  const refused = !text && !choice.message.tool_calls?.length && !!choice.message.refusal;
  const stop =
    refused || choice.finish_reason === "content_filter"
      ? "refusal"
      : choice.message.tool_calls?.length
        ? "tool_use"
        : choice.finish_reason === "length"
          ? "max_tokens"
          : "end_turn";
  return {
    id,
    type: "message",
    role: "assistant",
    model,
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: {
      input_tokens: usage?.prompt_tokens ?? 0,
      output_tokens: usage?.completion_tokens ?? 0,
      cache_read_input_tokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
      cache_creation_input_tokens: 0,
    },
  } as unknown as Anthropic.Message;
}

export class OpenAIShimError extends Error {
  constructor(public readonly status: number, body: string) {
    super(`${status} ${body}`);
    this.name = "OpenAIShimError";
  }
}

type Config = { apiKey: string; baseUrl?: string; timeout: number; maxRetries: number; env?: Env; fetchFn?: typeof fetch };

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504]);

export function createOpenAIShim(config: Config) {
  const base = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const doFetch = config.fetchFn ?? fetch;

  async function post(body: Record<string, unknown>, options: ShimOptions = {}): Promise<Response> {
    const retries = options.maxRetries ?? config.maxRetries;
    for (let attempt = 0; ; attempt++) {
      const signals = [AbortSignal.timeout(options.timeout ?? config.timeout)];
      if (options.signal) signals.push(options.signal);
      const res = await doFetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.any(signals),
      });
      if (res.ok) return res;
      const text = await res.text().catch(() => "");
      // Out of quota comes back as 429 too, and retrying it never helps.
      if (attempt < retries && RETRYABLE.has(res.status) && !/insufficient_quota/.test(text)) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      throw new OpenAIShimError(res.status, text);
    }
  }

  async function create(params: Record<string, unknown>, options?: ShimOptions): Promise<Anthropic.Message> {
    const body = toOpenAIRequest(params, config.env);
    const res = await post(body, options);
    const json = (await res.json()) as { id?: string; model?: string; choices: OpenAIChoice[]; usage?: OpenAIUsage };
    const choice = json.choices?.[0];
    if (!choice) throw new OpenAIShimError(502, "no choices in response");
    return toAnthropicMessage(choice, json.usage, json.model ?? String(body.model), json.id);
  }

  function stream(params: Record<string, unknown>, options?: ShimOptions) {
    const listeners: Array<(delta: string) => void> = [];
    const done = (async () => {
      const body: Record<string, unknown> = { ...toOpenAIRequest(params, config.env), stream: true, stream_options: { include_usage: true } };
      const res = await post(body, options);
      if (!res.body) throw new OpenAIShimError(502, "no response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";
      let finish: string | null = null;
      let usage: OpenAIUsage | undefined;
      let id = "msg_openai";
      let model = String(body.model);
      let refusal = "";
      const calls: OpenAIToolCall[] = [];
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, cut).trim();
          buffer = buffer.slice(cut + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          const chunk = JSON.parse(data) as {
            id?: string;
            model?: string;
            usage?: OpenAIUsage;
            choices?: Array<{
              delta: { content?: string | null; refusal?: string | null; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> };
              finish_reason: string | null;
            }>;
          };
          if (chunk.id) id = chunk.id;
          if (chunk.model) model = chunk.model;
          if (chunk.usage) usage = chunk.usage;
          const c = chunk.choices?.[0];
          if (!c) continue;
          if (c.delta.content) {
            text += c.delta.content;
            for (const l of listeners) l(c.delta.content);
          }
          if (c.delta.refusal) refusal += c.delta.refusal;
          for (const tc of c.delta.tool_calls ?? []) {
            const slot = (calls[tc.index] ??= { id: "", type: "function", function: { name: "", arguments: "" } });
            if (tc.id) slot.id = tc.id;
            if (tc.function?.name) slot.function.name += tc.function.name;
            if (tc.function?.arguments) slot.function.arguments += tc.function.arguments;
          }
          if (c.finish_reason) finish = c.finish_reason;
        }
      }
      const toolCalls = calls.filter(Boolean);
      return toAnthropicMessage(
        { message: { content: text || null, tool_calls: toolCalls.length ? toolCalls : undefined, refusal: refusal || null }, finish_reason: finish },
        usage,
        model,
        id,
      );
    })();
    // Callers attach listeners right after this returns; nothing is read before the next tick.
    done.catch(() => {});
    const handle = {
      on(event: "text", fn: (delta: string) => void) {
        if (event === "text") listeners.push(fn);
        return handle;
      },
      finalMessage: () => done,
    };
    return handle;
  }

  const messages = {
    create: (params: Record<string, unknown>, options?: ShimOptions) => {
      const { betas: _b, fallbacks: _f, ...rest } = params;
      return create(rest, options);
    },
    stream: (params: Record<string, unknown>, options?: ShimOptions) => {
      const { betas: _b, fallbacks: _f, ...rest } = params;
      return stream(rest, options);
    },
  };
  return { messages, beta: { messages } };
}
