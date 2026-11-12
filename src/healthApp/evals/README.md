# Coach evals

Two sets of cases, one rule: **evals never bill the Anthropic API key.** They are run inside a Claude session.

- `coachSet.ts`: the coach eval set (12 Nov 2026), 152 cases in 16 categories. `goal_journey` covers new goals said any way ("I want abs", a wedding date, gain 8 kg, a 10k) and the step-by-step breakdown; `habits` covers environment and consistency (snacks in the house, the gym bag, snoozing, slips). These are questions Indian users actually ask a health coach, plus the edge cases Magnus's own rules create. Each case has a person (persona), a message, code checks and a must / must-not rubric.
- `cases.ts`: the earlier 105 cases (logging, honesty, failure, scope and jailbreaks). They're scored by code checks only.

## Running a set in a Claude session

`session.mts` runs the real turn loop (`chat.ts` answerTurn: the context block, tool rounds, the fixed draft lines and the phantom-card guard) with stubbed tools. Only the model call is replaced: a Claude session plays the coach. The Anthropic base URL points nowhere, so a stray real call fails instead of billing.

```
npm run evals:session -- --run <name>                 # coach set (default)
npm run evals:session -- --run <name> --set legacy    # or: all
npm run evals:session -- --run <name> --only pause    # an id fragment or a category
```

Each call writes these files to `runs/<name>/`:

1. `system.md`: the system prompt and the tools, exactly as the model gets them.
2. `pending.md`: the next model round for every unfinished case (the context block, history, message and tool results so far). The session answers each one as Magnus and writes the answers to `responses/*.json` as `{ "<case id>": { "<round>": { "text": "...", "tools": [{ "name": "...", "input": {} }] } } }`. Run the command again until nothing is pending. Most turns take 1 round, and tool turns take 2 to 3.
3. A judge pass then reads each reply against its rubric and writes `judgments/*.json` as `{ "<case id>": { "must": [true, ...], "mustNot": [false, ...], "note": "...", "tone": 2 } }`. In `mustNot`, `true` means the reply did the bad thing. `tone` is 1 (dry or preachy), 2 (fine, neutral) or 3 (warm and specific); leave it out for a fixed line written by code. Later files override earlier ones field by field.
4. `report.md` and `results.json`: pass rates per category, then each failure with its code checks, rubric misses, tools and reply.

A case passes when every code check passes, every `must` holds and no `mustNot` happened.

## Runs

- `runs/2026-11-12-baseline`: main at 7af7b60. **109 of 116** passed. The 7 failures were the plan-gap blame (2), coaching during a pause (2), an unlogged yesterday not raised, a supplement question declined as off-topic, and the root-cause card sentence deleted by the card guard.
- `runs/2026-11-12-tuned`: this branch. **115 of 116** passed. The 15 cases whose context or rules changed were answered again (gap, pause, unlogged, scope). The other 101 answers were carried over and replayed through the new code. The one remaining failure is `unlog-only-lunch`: a draft-only turn ends on the fixed card line, so it has no room for one caring sentence.

- `runs/2026-11-12-habits`: main plus 31 new goal and habit cases, and a tone score on every reply. **144 of 147**, tone 2.4 of 3 on average. New failures: a 3-week wedding goal answered with no word about the wedding, and a snoozed morning walk with no offer to fix its time on the routine. Dry spots: a missed deadline stated flatly, an unsafe wedding goal and an overnight-gain panic answered with facts first, and "Same as what?".
- `runs/2026-11-12-habits-tuned`: with the new-goal, habit and tone lines in the prompt. **146 of 147**, tone 2.4 (goals 2.3 → 2.6, habits 2.6 → 2.7). 9 cases answered again, the rest carried over.
- `runs/2026-11-12-inevitable`: 5 new `inevitable` cases (kept days, their why, checkpoints) for batch 1 of the "make the goal inevitable" plan. **4 of 5**, tone 3.0. The one miss: a "the goal feels impossible" reply pointed at the next checkpoint but named no concrete action. The other 147 cases weren't re-answered; their context now carries a "Why this goal" line and "(key)" marks on checks.

Limits: the session model is a strong one. In production, short logs go to the fast model (`routedModel` in results.json), which may do worse on those cases. The coach and the judge are the same session, so a person should spot-check the judgments.
