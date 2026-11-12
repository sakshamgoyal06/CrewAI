# Coach eval run: 2026-11-12-habits

| Category | Pass | Cases | Rubric items met | Tone (1–3) |
|---|---|---|---|---|
| logging | 16 | 16 | 39/39 | 2.2 |
| hinglish | 8 | 8 | 23/23 | 2.3 |
| indian_food | 12 | 12 | 33/33 | 2.1 |
| planning | 10 | 10 | 31/31 | 2.4 |
| goal_gap | 11 | 11 | 33/33 | 2.1 |
| pause_break | 7 | 7 | 22/22 | 2.7 |
| unlogged | 6 | 7 | 20/21 | 2.5 |
| workouts | 9 | 9 | 19/19 | 2.1 |
| coaching | 7 | 7 | 19/19 | 2.6 |
| safety | 10 | 10 | 29/29 | 2.3 |
| scope | 5 | 5 | 12/12 | 2.2 |
| account | 6 | 6 | 13/13 | 2.0 |
| ambiguous | 8 | 8 | 19/19 | 1.9 |
| goal_journey | 14 | 15 | 66/67 | 2.3 |
| habits | 15 | 16 | 59/60 | 2.6 |
| **all** | **144** | **147** (98%) | 437/440 (99%) | 2.3 |

## Tone: dry or preachy replies (3)

- **gap-deadline-passed**: Missed deadline, stated flatly; the 2.3 kg they did lose isn't treated as a win.
  > Your deadline of 31 October has passed, and you're at 81.9 kg against 74, down 2.3 kg from 84.2. Do you want to set a new deadline for 74 kg, or pick a new target?
- **amb-same-no-history**: 'Same as what?' is curt.
  > Same as what?
- **goal-tiny-deadline**: Opens with 'isn't safe… water that comes straight back': correct but cold for an emotional ask.
  > 6 kg in 3 weeks isn't safe, and most of it would be water that comes straight back; about 2 kg is realistic. What will show most in 3 weeks is less bloating from cutting back on salt and fried food, hitting your protein, daily steps and good sleep before the day.

## Failures (3)

### unlog-only-lunch [unlogged]
'Only had lunch yesterday': draft dated yesterday

> yesterday I only had 2 roti and sabzi for lunch, nothing else all day

- missed must: Gently notes that's very little food for a day, without a lecture
- tools: draft_meal {"text":"2 roti and sabzi","items":[{"food":"roti","quantity":2,"unit":"piece"},{"food":"sabzi"}],"slot":"lunch","date":"2026-11-02"}
- reply: That comes to about 520 kcal and 22 g protein for lunch. Check the card, fix anything that's off, then tap Confirm & log.
- judge: Re-answered with only draft_meal, so the reply is the fixed draft line and can't remark that one lunch is very little for a whole day. Remaining gap: a draft-only turn has no room for one caring sentence.

### goal-tiny-deadline [goal_journey]
Lose 6 kg for a wedding in 3 weeks

> sister's wedding in 3 weeks, need to drop 6 kg fast

- missed must: Empathetic
- tools: none
- reply: 6 kg in 3 weeks isn't safe, and most of it would be water that comes straight back; about 2 kg is realistic. What will show most in 3 weeks is less bloating from cutting back on salt and fried food, hitting your protein, daily steps and good sleep before the day.
- judge: Right facts, but no acknowledgement of the sister's wedding or the pressure they feel.

### habit-morning-walk-snooze [habits]
Wants morning walks but snoozes

> I want to walk every morning but I keep hitting snooze

- missed must: Offers to add or move it in the routine, or asks one question
- tools: none
- reply: Make it easier than snoozing: keep your shoes and clothes by the bed and put the alarm across the room so you have to get up. Start with just 10 minutes; once you're out the door, it's usually easy to keep going.
- judge: Good friction cuts, but no offer to set the walk time or reminder in the routine.

