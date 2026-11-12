# Coach eval run: 2026-11-12-habits-tuned

| Category | Pass | Cases | Rubric items met | Tone (1–3) |
|---|---|---|---|---|
| logging | 16 | 16 | 39/39 | 2.2 |
| hinglish | 8 | 8 | 23/23 | 2.3 |
| indian_food | 12 | 12 | 33/33 | 2.1 |
| planning | 10 | 10 | 31/31 | 2.4 |
| goal_gap | 11 | 11 | 33/33 | 2.5 |
| pause_break | 7 | 7 | 22/22 | 2.7 |
| unlogged | 6 | 7 | 20/21 | 2.5 |
| workouts | 9 | 9 | 19/19 | 2.1 |
| coaching | 7 | 7 | 19/19 | 2.6 |
| safety | 10 | 10 | 29/29 | 2.3 |
| scope | 5 | 5 | 12/12 | 2.2 |
| account | 6 | 6 | 13/13 | 2.0 |
| ambiguous | 8 | 8 | 19/19 | 1.9 |
| goal_journey | 15 | 15 | 67/67 | 2.6 |
| habits | 16 | 16 | 60/60 | 2.7 |
| **all** | **146** | **147** (99%) | 439/440 (100%) | 2.4 |

## Tone: dry or preachy replies (1)

- **amb-same-no-history**: 'Same as what?' is curt.
  > Same as what?

## Failures (1)

### unlog-only-lunch [unlogged]
'Only had lunch yesterday': draft dated yesterday

> yesterday I only had 2 roti and sabzi for lunch, nothing else all day

- missed must: Gently notes that's very little food for a day, without a lecture
- tools: draft_meal {"text":"2 roti and sabzi","items":[{"food":"roti","quantity":2,"unit":"piece"},{"food":"sabzi"}],"slot":"lunch","date":"2026-11-02"}
- reply: That comes to about 520 kcal and 22 g protein for lunch. Check the card, fix anything that's off, then tap Confirm & log.
- judge: Re-answered with only draft_meal, so the reply is the fixed draft line and can't remark that one lunch is very little for a whole day. Remaining gap: a draft-only turn has no room for one caring sentence.

