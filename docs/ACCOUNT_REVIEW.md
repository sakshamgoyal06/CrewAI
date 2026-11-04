# Paused accounts and review requests

Coach chat is for health only. The coach declines anything else and logs each decline as an
`off_topic` row in `health_app_events`.

| Declines in one local day | What happens |
| --- | --- |
| 1–4 | One-line decline; the health part of the message is still logged |
| 5 | Off-topic brake: non-health messages get a fixed reply with no model call, plus a warning that 3 more will pause the account |
| 6–7 | Same, with the countdown |
| 8 | The account is paused: an `account_disabled` row is written and every request returns 403 `account_disabled` |

Settings: `MAGNUS_OFF_TOPIC_LIMIT` (default 5) and `MAGNUS_OFF_TOPIC_PAUSE_AFTER` (default 3).
Set either to 0 to turn it off. The owner (`MAGNUS_OWNER_EMAIL`) is never paused.

## Review requests

A paused person sees why, and an **Ask for a review** link. It opens a ready-made email to
`MAGNUS_SUPPORT_EMAIL` (or `MAGNUS_OWNER_EMAIL` when that isn't set) with their account reference.

To review a case, read what they sent (chat text is in `health_chat_messages`, declines in
`health_app_events` where `kind = 'off_topic'`):

```sql
select occurred_at, kind, name, props
from health_app_events
where user_profile_id = '<account reference>'
  and kind in ('off_topic', 'account_disabled', 'account_enabled')
order by occurred_at desc
limit 50;
```

To re-enable the account (takes effect within a minute):

```sql
insert into health_app_events (user_profile_id, source, kind, name, status, props, occurred_at)
values ('<account reference>', 'server', 'account_enabled', 'review', 200, '{"by":"owner"}', now());
```
