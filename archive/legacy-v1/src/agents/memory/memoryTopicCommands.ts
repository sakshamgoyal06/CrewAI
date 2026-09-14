/**
 * Step 2 — Telegram memory topic commands (show / forget / remember).
 * Handled before orchestrator — no model call.
 */
import { memoryConfig } from "./memoryConfig.js";
import {
  deleteMemoryTopicByKey,
  loadMemoryTopics,
  rememberMemoryTopic,
  resolveForgetTopics,
} from "./memoryTopics.js";

export type MemoryTopicCommand =
  | { kind: "show" }
  | { kind: "forget"; query: string }
  | { kind: "remember"; body: string };

const SHOW_PATTERN =
  /^(what do you remember|what(?:'s| is) in (?:your )?memory|show (?:my )?memories|list (?:my )?memories)\??$/i;

/** Parse user text into a memory command, or null when not a memory command. */
export function parseMemoryTopicCommand(rawMessage: string): MemoryTopicCommand | null {
  const msg = rawMessage.trim();
  if (!msg) {
    return null;
  }

  if (SHOW_PATTERN.test(msg)) {
    return { kind: "show" };
  }

  const forgetMatch =
    msg.match(/^forget(?: about)?\s+(.+)$/i) ??
    msg.match(/^don'?t remember(?: about)?\s+(.+)$/i);
  if (forgetMatch?.[1]?.trim()) {
    return { kind: "forget", query: forgetMatch[1].trim() };
  }

  const rememberMatch = msg.match(/^remember(?: that)?\s+(.+)$/i);
  if (rememberMatch?.[1]?.trim()) {
    return { kind: "remember", body: rememberMatch[1].trim() };
  }

  return null;
}

export type MemoryTopicCommandResult =
  | { handled: true; replyText: string }
  | { handled: false };

/** Resolve memory topic commands without invoking the orchestrator. */
export async function tryHandleMemoryTopicCommand(
  userProfileId: string,
  rawMessage: string,
): Promise<MemoryTopicCommandResult> {
  const cmd = parseMemoryTopicCommand(rawMessage);
  if (!cmd) {
    return { handled: false };
  }

  const config = memoryConfig();
  if (!config.topicsEnabled) {
    return {
      handled: true,
      replyText: "Memory topics aren't enabled on this deployment.",
    };
  }

  switch (cmd.kind) {
    case "show": {
      const topics = await loadMemoryTopics(userProfileId, 50);
      if (topics.length === 0) {
        return {
          handled: true,
          replyText:
            "I don't have any saved memory topics yet. Say **remember …** to store something.",
        };
      }
      const lines = topics.map((t) => `- ${t.label}`);
      return {
        handled: true,
        replyText: `Here's what I remember:\n${lines.join("\n")}`,
      };
    }
    case "forget": {
      const resolved = await resolveForgetTopics(userProfileId, cmd.query);
      if (resolved.status === "none") {
        return {
          handled: true,
          replyText: `I couldn't find anything matching "${cmd.query}" to forget.`,
        };
      }
      if (resolved.status === "ambiguous") {
        const lines = resolved.matches.map((m) => `- ${m.topic.label}`).join("\n");
        return {
          handled: true,
          replyText:
            `I found several memory topics matching "${cmd.query}":\n${lines}\n\n` +
            "Be more specific — e.g. **forget lauki** or **forget job search ML**.",
        };
      }

      let deleted = 0;
      for (const match of resolved.matches) {
        const ok = await deleteMemoryTopicByKey(userProfileId, match.topic.topic_key);
        if (ok) {
          deleted += 1;
        }
      }
      if (deleted === 0) {
        return {
          handled: true,
          replyText: `I couldn't find anything matching "${cmd.query}" to forget.`,
        };
      }
      return {
        handled: true,
        replyText: `Forgot ${deleted} memory topic${deleted === 1 ? "" : "s"} matching "${cmd.query}".`,
      };
    }
    case "remember": {
      const topic = await rememberMemoryTopic(userProfileId, cmd.body);
      return {
        handled: true,
        replyText: `Got it — I'll remember: ${topic.label}`,
      };
    }
  }
}
