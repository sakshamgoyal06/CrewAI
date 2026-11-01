# Chat samples for test suite generation

| File | Contents |
|------|----------|
| `real-user-messages.json` | 312 user messages from `magnus_chat_messages` (Aug 2026) |
| `conversation-pairs.json` | User → assistant pairs for production issue analysis |

Refresh with live Supabase:

```bash
npx tsx scripts/dev/export-real-chat-messages.mts
npx tsx scripts/dev/generate-chat-message-test-suite.mts
```
