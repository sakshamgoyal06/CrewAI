#!/usr/bin/env node
/**
 * One-time Google Calendar authorization.
 *
 * Prints a URL, waits on a loopback port for Google to redirect back, saves the token, and prints
 * the refresh token — which is what the deployed bot needs, since a container has no browser and no
 * persistent disk.
 *
 * Run: npm run google-calendar:auth              (or `-- --manual` to paste the code by hand)
 *
 * Prerequisite: GOOGLE_OAUTH_CREDENTIALS pointing at the OAuth **desktop** client JSON from Google
 * Cloud, on a project with the Google Calendar API enabled.
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
} from "../src/integrations/googleCalendar/auth.js";
import { googleCalendarTokenPath } from "../src/integrations/googleCalendar/paths.js";

const DONE_PAGE = `<!doctype html><html><body style="font-family:system-ui;padding:3rem">
<h2>Magnus is connected to Google Calendar.</h2>
<p>Close this tab and go back to your terminal.</p>
</body></html>`;

function report(refreshToken?: string): void {
  console.log(`\nSaved token to ${googleCalendarTokenPath()}`);

  if (!refreshToken) {
    console.log(
      "\nGoogle did not return a refresh token — it only issues one on first consent.\n" +
        "Revoke access at https://myaccount.google.com/permissions and run this again.\n",
    );
    return;
  }

  const { clientId, clientSecret } = resolvedClientCredentials();

  console.log("\nSet these three on your host (Railway → Variables):\n");
  console.log(`GOOGLE_CLIENT_ID=${clientId}`);
  console.log(`GOOGLE_CLIENT_SECRET=${clientSecret}`);
  console.log(`GOOGLE_CALENDAR_REFRESH_TOKEN=${refreshToken}`);
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

/** Resolves with the `code` query parameter from Google's redirect. */
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
  console.log("\nGoogle Calendar — one-time authorization");
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
