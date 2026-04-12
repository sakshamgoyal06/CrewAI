const ROUTINE_ID = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";

export type ParsedHevyWrite =
  | { kind: "routine"; text: string }
  | { kind: "routine_update"; routineId: string; text: string }
  | { kind: "workout"; text: string }
  | { kind: "none" };

/**
 * Explicit Hevy write commands (avoids hijacking normal fitness chat).
 * - `hevy routine: …` — create routine
 * - `hevy routine update: <uuid> — …` — replace routine (PUT); uuid then em dash, colon, or hyphen + space then plan
 * - `hevy workout: …` — log workout
 * - `/hevy routine: …` when `slashCommandKey === "hevy"` (payload only in `rawMessage`).
 */
export function parseHevyWriteCommand(
  rawMessage: string,
  slashCommandKey?: string,
): ParsedHevyWrite {
  const t = rawMessage.trim();

  if (slashCommandKey === "hevy") {
    const updSlash = t.match(
      new RegExp(`^routine\\s+update\\s*:\\s*${ROUTINE_ID}\\s*[-\\u2014\\u2013:]\\s*(.+)$`, "is"),
    );
    if (updSlash?.[1] && updSlash[2]?.trim()) {
      return { kind: "routine_update", routineId: updSlash[1]!, text: updSlash[2]!.trim() };
    }
    const updSlashSp = t.match(
      new RegExp(`^routine\\s+update\\s*:\\s*${ROUTINE_ID}\\s+(.+)$`, "is"),
    );
    if (updSlashSp?.[1] && updSlashSp[2]?.trim()) {
      return { kind: "routine_update", routineId: updSlashSp[1]!, text: updSlashSp[2]!.trim() };
    }
    const slashM = t.match(/^(routine|workout)\s*:\s*(.+)$/is);
    if (slashM?.[2]?.trim()) {
      const kind = slashM[1]!.toLowerCase() as "routine" | "workout";
      return { kind, text: slashM[2]!.trim() };
    }
  }

  const upd = t.match(
    new RegExp(
      `^hevy\\s+routine\\s+update\\s*:\\s*${ROUTINE_ID}\\s*[-\\u2014\\u2013:]\\s*(.+)$`,
      "is",
    ),
  );
  if (upd?.[1] && upd[2]?.trim()) {
    return { kind: "routine_update", routineId: upd[1]!, text: upd[2]!.trim() };
  }
  const updSp = t.match(new RegExp(`^hevy\\s+routine\\s+update\\s*:\\s*${ROUTINE_ID}\\s+(.+)$`, "is"));
  if (updSp?.[1] && updSp[2]?.trim()) {
    return { kind: "routine_update", routineId: updSp[1]!, text: updSp[2]!.trim() };
  }

  const wM = t.match(/^hevy\s+workout\s*:\s*(.+)$/i);
  if (wM?.[1]?.trim()) {
    return { kind: "workout", text: wM[1]!.trim() };
  }

  const rM = t.match(/^hevy\s+routine\s*:\s*(.+)$/i);
  if (rM?.[1]?.trim()) {
    return { kind: "routine", text: rM[1]!.trim() };
  }

  return { kind: "none" };
}

export function isHevyWriteCommand(rawMessage: string, slashCommandKey?: string): boolean {
  return parseHevyWriteCommand(rawMessage, slashCommandKey).kind !== "none";
}
