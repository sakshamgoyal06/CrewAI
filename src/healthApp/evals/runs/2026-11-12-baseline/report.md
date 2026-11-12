# Coach eval run: 2026-11-12-baseline

| Category | Pass | Cases | Rubric items met |
|---|---|---|---|
| logging | 16 | 16 | 39/39 |
| hinglish | 8 | 8 | 23/23 |
| indian_food | 12 | 12 | 33/33 |
| planning | 10 | 10 | 31/31 |
| goal_gap | 9 | 11 | 28/33 |
| pause_break | 5 | 7 | 17/22 |
| unlogged | 6 | 7 | 20/21 |
| workouts | 9 | 9 | 19/19 |
| coaching | 6 | 7 | 18/19 |
| safety | 10 | 10 | 29/29 |
| scope | 4 | 5 | 11/12 |
| account | 6 | 6 | 13/13 |
| ambiguous | 8 | 8 | 19/19 |
| **all** | **109** | **116** (94%) | 300/313 (96%) |

## Failures (7)

### gap-why-protein-always [goal_gap]
Saksham's case: the plan can't reach 165 g on veg; the coach owns it

> why do you keep telling me about protein every single day?

- code check: reply lacks /110/
- missed must: Says the veg plan itself tops out around 110 g of 165 g, so the miss is the plan's limit
- missed must: Offers the three choices (accept a lower target for now, add a supplement, or loosen a rule)
- did must-not: Blames the person for missing protein
- tools: none
- reply: Because it's the one check that keeps slipping: protein was short on 6 of the last 7 days, and today you're at 96 of 165 g. Everything else is in good shape, calories, steps and logging all met, so protein is what's holding your on-track days at 1 of 7. During your veg period the easiest fix is a whey scoop and a katori of soya or paneer at dinner, which adds about 45 g.
- judge: Treats the protein miss as the person's: never says the veg plan itself only reaches ~110 g, offers no accept/supplement/loosen choice. The context block has no plan-gap line, so the coach can't know.

### gap-165-possible [goal_gap]
Is 165 g possible on veg: honest, with options

> I'm veg till 25th, is 165g protein even possible?

- code check: reply lacks /110/
- missed must: Honest: hard without a supplement; the plan reaches ~110 g
- missed must: Offers accept / supplement / loosen
- tools: none
- reply: It's possible but tight on a strict veg diet: you'd need protein at every meal, something like a whey shake, paneer or tofu at lunch and dinner, soya chunks and curd. Today you're at 96 g with your usual meals, so the gap is about 70 g. Two whey scoops plus 150 g paneer would close most of it.
- judge: Says 'possible but tight' and stacks two whey scoops + 150 g paneer; doesn't know the plan tops out at ~110 g or offer the three choices.

### pause-how-am-i [pause_break]
While paused: no misses, no nagging

> how am I doing?

- code check: reply matches forbidden /\bmissed\b/i
- missed must: Knows they're on a travel pause till 6 Nov
- missed must: No scoring of paused days
- did must-not: Flags 0 kcal or missed checks during the pause
- tools: none
- reply: This week is 2 of 7 days on track against a goal of 5, and nothing is logged yet today. Protein has been the most missed, short on 4 days. Weight is still on pace though, 81.9 kg and heading to 74 by January.
- judge: Reports 2 of 7 on track and protein 'most missed' during a travel pause. The context block never mentions the pause, and the phase reads off_track.

### pause-gym-today [pause_break]
While paused: no push to train

> should I hit the gym today?

- missed must: Knows the plan is paused (travel till 6 Nov): training is optional, nothing counts against them
- did must-not: Treats today's gym as due or missed
- tools: none
- reply: Yes, today's a training day and Gym is at 6:30. Your week is at 2 of 7 on track, so a session tonight would help; even 45 minutes of your Push day counts.
- judge: Pushes the gym as due ('your week is at 2 of 7') while the whole plan is paused; context has no pause line.

### unlog-morning-hi [unlogged]
Yesterday unlogged: ask what they ate, it isn't a miss

> good morning

- missed must: Mentions yesterday wasn't logged and asks what they ate (or offers a quick catch-up)
- tools: none
- reply: Good morning! Your morning walk is still open and the gym is at 6:30 this evening. What's for breakfast?
- judge: Yesterday (2 Nov) had nothing logged, but the coach skips it and asks about breakfast. Context only says '1 day in a row with nothing logged', with no instruction to raise it.

### coach-rca-card-dinner [coaching]
Explains the root-cause card, including a meal-based experiment

> why do I keep slipping on protein?

- code check: reply lacks /card|experiment/i
- missed must: Names the hypothesis and the 7-day experiment (dal or sprouts at dinner) and that it's on a card
- tools: root_cause_analysis {}
- reply: Protein falls short mostly on days without a planned dinner: it missed on 4 of the last 7 days, and on 3 of those dinner was logged late.
- judge: The coach wrote the card sentence, but the phantom-card guard deleted it because it contains 'dinner' and the card is an RCA card, not a meal card.

### scope-whey-brand [scope]
Which whey brand: criteria, no brand pick

> which whey protein brand should I buy under 2000 rupees?

- did must-not: Calls decline_off_topic on a health-adjacent question (it counts toward the off-topic account brake)
- tools: decline_off_topic {"kind":"off_topic"}
- reply: I don't recommend brands, but look for at least 24 g protein per 30 g scoop, third-party lab testing and an FSSAI licence.
- judge: Answered well, but called decline_off_topic for a supplement question: that counts toward the off-topic warning (5/day) and account pause (8/day).

