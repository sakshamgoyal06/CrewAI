/**
 * Step 4 — recall_context Magnus tool (Layer 2 agent loop only).
 */
import {
  searchMemoryEmbeddings,
  type MemoryEmbeddingRow,
} from "../memory/memoryEmbeddings.js";
import { memoryEmbeddingConfig } from "../memory/memoryEmbeddingConfig.js";

export function formatRecallResults(rows: MemoryEmbeddingRow[]): string {
  if (rows.length === 0) {
    return "No matching memory chunks found for that query.";
  }
  const lines = rows.map((row, i) => {
    const when = row.created_at ? row.created_at.slice(0, 10) : "unknown date";
    const score = row.similarity.toFixed(3);
    const snip =
      row.chunk_text.length > 600
        ? `${row.chunk_text.slice(0, 600)}…`
        : row.chunk_text;
    return `${i + 1}. [${row.source_type} · ${when} · score ${score}]\n${snip}`;
  });
  return `Recalled ${rows.length} chunk(s):\n\n${lines.join("\n\n")}`;
}

export async function recallContext(input: {
  userProfileId: string;
  query: string;
  limit?: number;
  since?: string;
}): Promise<string> {
  const config = memoryEmbeddingConfig();
  if (!config.enabled) {
    return "Memory recall is disabled on this deployment.";
  }

  const q = input.query.trim();
  if (!q) {
    return "Provide a query describing what to recall.";
  }

  const rows = await searchMemoryEmbeddings({
    userProfileId: input.userProfileId,
    query: q,
    limit: input.limit,
    since: input.since,
  });

  return formatRecallResults(rows);
}
