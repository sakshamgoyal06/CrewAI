#!/usr/bin/env node
/**
 * One-time OAuth setup for Google Calendar MCP.
 *
 * 1. Google Cloud Console → enable Calendar API → OAuth desktop client → download JSON
 * 2. export GOOGLE_OAUTH_CREDENTIALS=/path/to/client_secret.json
 * 3. npm run google-calendar:auth
 * 4. Open the printed URL, authorize, paste the code when prompted
 */
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  createOAuth2Client,
  exchangeCodeForToken,
  getAuthUrl,
} from "../src/integrations/googleCalendar/auth.js";
import { googleCalendarTokenPath } from "../src/integrations/googleCalendar/paths.js";

async function main(): Promise<void> {
  const oauth2 = createOAuth2Client();
  const url = getAuthUrl(oauth2);

  console.log("\nGoogle Calendar — one-time authorization\n");
  console.log("1. Open this URL in your browser:\n");
  console.log(url);
  console.log("\n2. After approving, Google shows an authorization code.");
  console.log("   Paste it below.\n");

  const rl = createInterface({ input, output });
  const code = (await rl.question("Authorization code: ")).trim();
  rl.close();

  if (!code) {
    console.error("No code entered.");
    process.exit(1);
  }

  await exchangeCodeForToken(oauth2, code);

  console.log(`\nSaved token to ${googleCalendarTokenPath()}`);
  console.log("Restart Cursor (or reload MCP) to use google-calendar tools.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
