import { logger } from "../../logger.js";
import { anthropic } from "../../tools/clients.js";
import { loggableError } from "../../util/loggableError.js";

const DEFAULT_MODEL = process.env.MAGNUS_PROACTIVE_LLM_MODEL?.trim() || "claude-haiku-4-5";

export type GateAndComposeInput = {
  kind: string;
  systemPreamble: string;
  contextBlock: string;
  userInstruction?: string | null;
};

export type GateAndComposeResult = {
  send: boolean;
  message: string;
  skipReason?: string;
};

function parseGateJson(text: string): GateAndComposeResult | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as {
      send?: boolean;
      message?: string;
      skip_reason?: string;
    };
    if (typeof parsed.send !== "boolean") {
      return null;
    }
    return {
      send: parsed.send,
      message: typeof parsed.message === "string" ? parsed.message.trim() : "",
      skipReason: typeof parsed.skip_reason === "string" ? parsed.skip_reason : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Single Haiku call: decide whether to send and compose the Telegram message.
 */
export async function gateAndCompose(input: GateAndComposeInput): Promise<GateAndComposeResult> {
  const system = `${input.systemPreamble}

Return JSON only:
{ "send": boolean, "message": string, "skip_reason": string | null }

Rules:
- If send is false, message must be empty and skip_reason explains why.
- If send is true, message is 2-4 short lines for Telegram (plain text, no markdown headers).
- Warm, direct, no guilt. One clear ask when relevant.
- Never claim you logged, saved, or scheduled anything.`;

  const userParts = [input.contextBlock];
  if (input.userInstruction?.trim()) {
    userParts.push(`User instruction for this subscription: ${input.userInstruction.trim()}`);
  }

  try {
    const msg = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: userParts.join("\n\n") }],
    });

    for (const block of msg.content) {
      if (block.type === "text") {
        const parsed = parseGateJson(block.text);
        if (parsed) {
          if (parsed.send && !parsed.message) {
            return { send: false, message: "", skipReason: "empty_message" };
          }
          return parsed;
        }
      }
    }
  } catch (e) {
    logger.warn({ err: loggableError(e), kind: input.kind }, "proactive gateAndCompose failed");
  }

  return { send: false, message: "", skipReason: "llm_error" };
}
