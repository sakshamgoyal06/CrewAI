/**
 * Seals every plain Hevy key in user_integrations with MAGNUS_SECRETS_KEY. Safe to re-run:
 * already-sealed values are skipped.
 *
 *   MAGNUS_SECRETS_KEY=... npm run secrets:encrypt
 */
import "dotenv/config";

import { supabase } from "../src/tools/clients.js";
import { isSealed, seal, secretsKey } from "../src/util/secretBox.js";

const key = secretsKey();
if (!key) {
  console.error("Set MAGNUS_SECRETS_KEY first (openssl rand -hex 32).");
  process.exit(1);
}
const { data, error } = await supabase.from("user_integrations").select("user_profile_id, hevy_api_key").not("hevy_api_key", "is", null);
if (error) throw new Error(error.message);
let sealed = 0;
for (const r of data ?? []) {
  const v = String(r.hevy_api_key ?? "").trim();
  if (!v || isSealed(v)) continue;
  const up = await supabase.from("user_integrations").update({ hevy_api_key: seal(v, key) }).eq("user_profile_id", r.user_profile_id);
  if (up.error) throw new Error(up.error.message);
  sealed += 1;
}
console.log(`Sealed ${sealed} key(s); ${(data ?? []).length - sealed} already sealed or empty.`);
