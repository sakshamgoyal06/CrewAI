# Coach evals

Two sets of cases, one rule: **evals never bill the Anthropic API key.** They are run inside a Claude session.

- `coachSet.ts`: the coach eval set (12 Nov 2026), 116 cases in 13 categories. These are questions Indian users actually ask a health coach, plus the edge cases Magnus's own rules create. Each case has a person (persona), a message, code checks and a must / must-not rubric.
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
3. A judge pass then reads each reply against its rubric and writes `judgments/*.json` as `{ "<case id>": { "must": [true, ...], "mustNot": [false, ...], "note": "..." } }`. In `mustNot`, `true` means the reply did the bad thing.
4. `report.md` and `results.json`: pass rates per category, then each failure with its code checks, rubric misses, tools and reply.

A case passes when every code check passes, every `must` holds and no `mustNot` happened.

## Runs

- `runs/2026-11-12-baseline`: main at 7af7b60. **109 of 116** passed. The 7 failures were the plan-gap blame (2), coaching during a pause (2), an unlogged yesterday not raised, a supplement question declined as off-topic, and the root-cause card sentence deleted by the card guard.
- `runs/2026-11-12-tuned`: this branch. **115 of 116** passed. The 15 cases whose context or rules changed were answered again (gap, pause, unlogged, scope). The other 101 answers were carried over and replayed through the new code. The one remaining failure is `unlog-only-lunch`: a draft-only turn ends on the fixed card line, so it has no room for one caring sentence.

Limits: the session model is a strong one. In production, short logs go to the fast model (`routedModel` in results.json), which may do worse on those cases. The coach and the judge are the same session, so a person should spot-check the judgments.
