#!/usr/bin/env node
/**
 * One-time YouTube authorization.
 *
 * Prints a URL, waits on a loopback port for Google to redirect back, saves the token, and prints
 * the refresh token for the deployed bot.
 *
 * Run: npm run youtube:auth              (or `-- --manual` to paste the code by hand)
 *
 * Prerequisite: GOOGLE_OAUTH_CREDENTIALS pointing at the OAuth **desktop** client JSON from Google
 * Cloud, on a project with the YouTube Data API v3 enabled.
 */
import { createServer, type Server } from "node:http";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { AddressInfo } from "node:net";

import {
  createOAuth2Client,
  exchangeCodeForToken,
  getAuthUrl,
  resolvedClientCredentials,
} from "../src/integrations/youtube/auth.js";
import { googleYoutubeTokenPath } from "../src/integrations/youtube/paths.js";

const DONE_PAGE = `<!doctype html><html><body style="font-family:system-ui;padding:3rem">
<h2>Magnus is connected to YouTube.</h2>
<p>Close this tab and go back to your terminal.</p>
</body></html>`;

function report(refreshToken?: string): void {
  console.log(`\nSaved token to ${googleYoutubeTokenPath()}`);

  if (!refreshToken) {
    console.log(
      "\nGoogle did not return a refresh token — it only issues one on first consent.\n" +
        "Revoke access at https://myaccount.google.com/permissions and run this again.\n",
    );
    return;
  }

  const { clientId, clientSecret } = resolvedClientCredentials();

  console.log("\nPlatform (Railway) — shared OAuth app only:\n");
  console.log(`GOOGLE_CLIENT_ID=${clientId}`);
  console.log(`GOOGLE_CLIENT_SECRET=${clientSecret}`);
  console.log(
    "\nPer-user token — do NOT put this on Railway. Store it in Supabase user_integrations:\n",
  );
  console.log(`# in local .env (for the upsert script only)`);
  console.log(`GOOGLE_YOUTUBE_REFRESH_TOKEN=${refreshToken}`);
  console.log(`TELEGRAM_USER_ID=<your Telegram numeric user id>`);
  console.log(`npx tsx scripts/upsert-user-integrations.mts`);
  console.log(
    "\nIf the OAuth app is still in Testing, publish it (Google Cloud → Audience → Publish app)\n" +
      "or this refresh token stops working after 7 days.\n",
  );
}

async function listenOnLoopback(): Promise<{ server: Server; redirectUri: string }> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const { port } = server.address() as AddressInfo;
  return { server, redirectUri: `http://127.0.0.1:${port}` };
}

function firstCode(server: Server, redirectUri: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    server.on("request", (req, res) => {
      const url = new URL(req.url ?? "/", redirectUri);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      res.writeHead(200, { "content-type": "text/html" });
      res.end(code ? DONE_PAGE : `<p>Authorization failed: ${error ?? "no code returned"}</p>`);

      if (code) {
        resolve(code);
      } else {
        reject(new Error(error ?? "Google returned no authorization code"));
      }
    });
    setTimeout(
      () => reject(new Error("Timed out after 5 minutes. Re-run, or try --manual.")),
      5 * 60_000,
    ).unref();
  });
}

async function manualFlow(): Promise<void> {
  const oauth2 = createOAuth2Client();
  console.log("\n1. Open this URL and approve access:\n");
  console.log(getAuthUrl(oauth2));
  console.log("\n2. The browser will fail to load a localhost page — that is expected.");
  console.log("   Copy the `code` value out of the address bar and paste it here.\n");

  const rl = createInterface({ input, output });
  const code = (await rl.question("Authorization code: ")).trim();
  rl.close();
  if (!code) {
    throw new Error("No code entered.");
  }

  await exchangeCodeForToken(oauth2, code);
  report(oauth2.credentials.refresh_token ?? undefined);
}

async function loopbackFlow(): Promise<void> {
  const { server, redirectUri } = await listenOnLoopback();
  const oauth2 = createOAuth2Client(redirectUri);

  console.log("\nOpen this URL in your browser and approve access:\n");
  console.log(getAuthUrl(oauth2));
  console.log("\nWaiting for Google to redirect back…");

  try {
    const code = await firstCode(server, redirectUri);
    await exchangeCodeForToken(oauth2, code);
    report(oauth2.credentials.refresh_token ?? undefined);
  } finally {
    server.close();
  }
}

async function main(): Promise<void> {
  console.log("\nYouTube — one-time authorization");
  if (process.argv.includes("--manual")) {
    await manualFlow();
    return;
  }
  await loopbackFlow();
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
