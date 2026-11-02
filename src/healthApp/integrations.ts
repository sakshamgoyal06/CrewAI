/**
 * Per-user connections the person sets up from the app: their own Hevy API key (Hevy Pro →
 * Settings → Developer). The key is checked against Hevy before it is saved.
 */
import { z } from "zod";

import { fetchHevyWorkoutsPage } from "../pillars/health/workouts/hevy/index.js";
import { loadUserIntegrations, upsertUserIntegrations } from "../users/userIntegrations.js";
import { invalidateHevyHistory } from "./hevyHistory.js";

export const hevyKeyInput = z.object({ apiKey: z.string().trim().min(8).max(200) });

export async function connectHevy(
  userProfileId: string,
  input: z.infer<typeof hevyKeyInput>,
  fetchImpl?: typeof fetch,
): Promise<{ ok: boolean; error?: string }> {
  const probe = await fetchHevyWorkoutsPage(input.apiKey, 1, 1, { fetchImpl });
  if (!probe.ok) {
    return { ok: false, error: probe.status === 401 || probe.status === 403 ? "hevy_key_invalid" : "hevy_unavailable" };
  }
  const saved = await upsertUserIntegrations({ userProfileId, hevyApiKey: input.apiKey });
  if (!saved.ok) return { ok: false, error: saved.error };
  invalidateHevyHistory(userProfileId);
  return { ok: true };
}

export async function disconnectHevy(userProfileId: string): Promise<{ ok: boolean; error?: string }> {
  const saved = await upsertUserIntegrations({ userProfileId, hevyApiKey: "" });
  invalidateHevyHistory(userProfileId);
  return saved;
}

export async function hevyConnected(userProfileId: string): Promise<boolean> {
  return !!(await loadUserIntegrations(userProfileId)).hevyApiKey;
}
