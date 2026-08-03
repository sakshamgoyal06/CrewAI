# Notion setup for Magnus

Magnus supports **per-user** Notion in two ways:

1. **OAuth (recommended)** — one click in Telegram, like Google Calendar
2. **Manual token** — internal integration secret via `setup_notion save_token`

Lists always work in Supabase without Notion. Connecting Notion adds a human-readable mirror.

---

## OAuth setup (host / Railway)

### 1. Create a public connection

1. Open https://www.notion.so/my-integrations
2. **Build → Public connections → Create new connection**
3. Under **OAuth Domain & URIs**, add your redirect URI **exactly** (no query params):

```
https://YOUR_PUBLIC_HOST/oauth/notion/callback
```

Examples:
- Railway: `https://your-app.up.railway.app/oauth/notion/callback`
- Custom: value of `MAGNUS_PUBLIC_BASE_URL` + `/oauth/notion/callback`

4. Copy **OAuth client ID** and **OAuth client secret** from the Configuration tab.

### 2. Set environment variables on the host

```bash
NOTION_OAUTH_CLIENT_ID=...
NOTION_OAUTH_CLIENT_SECRET=...
MAGNUS_PUBLIC_BASE_URL=https://your-app.up.railway.app
```

### 3. Verify redirect URI

```bash
curl https://your-app.up.railway.app/oauth/notion
```

Response includes `redirect_uri` — must match Notion portal character-for-character.

### 4. Connect in Telegram

Say **“connect Notion”**. Magnus sends an OAuth link.

**Important — the Notion page picker is normal.** Notion asks which pages Magnus can access. Magnus list databases are **not** visible during OAuth; they are created **after** you click Allow access.

Recommended flow for a **fresh workspace**:

1. In Notion (new account or clean workspace), create an empty page called **Magnus**.
2. Open the OAuth link from Telegram.
3. In the page picker, select your **Magnus** page (or any top-level page).
4. Click **Allow access**.
5. Magnus creates the hub, **Journal** subpage, and standard **list catalogs** (watchlist, tasks, goals, etc.) under that hub.

Ensure your public connection has **Read**, **Insert**, and **Update content** capabilities (Developer portal → Configuration).

You do **not** need to paste database ids.

---

## Manual token (fallback)

If OAuth is not configured on the host:

1. Create an **internal** integration at https://www.notion.so/my-integrations
2. Share pages/databases with the integration
3. Paste the secret: `setup_notion` action `save_token`
4. `setup_notion set_hub` with hub page URL
5. `setup_notion discover` to link databases

Or use scripts:

```bash
TELEGRAM_USER_ID=... NOTION_TOKEN=secret_... npx tsx scripts/upsert-user-integrations.mts
TELEGRAM_USER_ID=... npx tsx scripts/reset-user-notion-lists.mts
```

---

## Testing list tools

After connect:

- `list catalog`
- `what's on my watchlist?`
- `add Dune to watchlist`

See also: `docs/NOTION_LIFEOS_STRUCTURE.md`
