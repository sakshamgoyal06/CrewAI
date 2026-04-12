import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";



import { anthropic } from "../../tools/clients.js";

import { augmentUserWithMemory } from "../memory/memoryAgent.js";
import { SPECIALIST_USER_IDENTITY } from "../promptIdentity.js";

import type { AgentContext, AgentResult, DepartmentAgent } from "../types.js";



const MODEL = "claude-sonnet-4-6";



/**

 * Books, film, poetry picks aligned to mood and taste — Joy pillar.

 */

export const CULTURE_RECOMMENDER_SYSTEM = `You are the Culture Recommender specialist for Magnus within LifeOS.

${SPECIALIST_USER_IDENTITY}

Scope: Suggest **books** (fiction or non-fiction), **films** (or series when apt), and **poetry** (collections or individual poems to seek) that fit the user's **mood, energy, and stated preferences** in their message. You may mix media in one reply when helpful.



**Format:** Prefer a **concise list** — short bullets or numbered items with title + author / director / poet and **one line** on why it fits them. Avoid long plot summaries; no spoilers for narrative twists unless they ask.



**Limits:** You do not browse the live web or streaming catalogs; recommendations are from general knowledge. Do not reproduce long copyrighted passages — brief titles and fair-use length quotes at most if they ask.



Optional context may be appended by the system (north star, timezone). Use it when present; if absent, proceed without mentioning missing data.



Keep replies under ~280 words unless they ask for more. Joy is a tank to protect; one focus per pillar; no guilt.`;



function textFromMessage(msg: Message): string {

  for (const block of msg.content) {

    if (block.type === "text") {

      return block.text;

    }

  }

  return "";

}



function optionalProfileBlock(ctx: AgentContext): string {

  const parts: string[] = [];

  if (ctx.northStarGoal?.trim()) {

    parts.push(`North star (from profile): ${ctx.northStarGoal.trim()}`);

  }

  if (ctx.timezone?.trim()) {

    parts.push(`Timezone (from profile): ${ctx.timezone.trim()}`);

  }

  if (parts.length === 0) {

    return "";

  }

  return `\n\n${parts.join("\n")}`;

}



export async function runCultureRecommenderAgent(

  ctx: AgentContext,

): Promise<AgentResult> {

  const profileBlock = optionalProfileBlock(ctx);

  const msg = await anthropic.messages.create({

    model: MODEL,

    max_tokens: 896,

    system: CULTURE_RECOMMENDER_SYSTEM,

    messages: [

      {

        role: "user",

        content: augmentUserWithMemory(

          `${ctx.rawMessage}${profileBlock}`,

          ctx.memoryBlock,

        ),

      },

    ],

  });

  const text = textFromMessage(msg).trim() || "…";

  return {

    text,

    metadata: {

      specialist: "CultureRecommender",

      pillar: "joy",

      department: "culture",

    },

  };

}



export const cultureRecommenderAgent: DepartmentAgent = {

  name: "CultureRecommender",

  departmentId: "CULTURE",

  run: runCultureRecommenderAgent,

};

