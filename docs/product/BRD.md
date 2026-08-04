# Magnus — Business Requirements Document (BRD)

**Version:** 1.0  
**Last updated:** 2026-08-04  
**Owner:** Product (LifeOS / Magnus)  
**Status:** Approved for implementation tracking

---

## 1. Document purpose

Defines **why** Magnus exists from a business and personal-operating-system perspective: stakeholders, problems, success metrics, constraints, and scope boundaries. Does not specify technical implementation (see TRD/ARD).

---

## 2. Stakeholders

| Stakeholder | Interest |
|-------------|----------|
| **Primary user (owner)** | Daily chief-of-staff: planning, logging, coaching, proactive briefs |
| **Provisioned users** | Multi-user-capable deployment; each with isolated data |
| **Operator / admin** | Uptime, secret rotation, user provisioning, cost control |
| **Future contributors** | Clear scope, reproducible environment |

---

## 3. Business problem

### 3.1 Current pain

- **Cognitive load of integration** — switching between calendar, gym app, meal tracking, notes, and finance fragments attention.
- **Generic AI lacks continuity** — no durable event log, no pillar-aware coaching, no proactive rituals.
- **LifeOS philosophy exists on paper** — rules (locked day, joy tank, balance penalty) are not enforced by software.
- **Human-readable vs machine-readable split** — Notion is great for reading; something else must execute and remember.

### 3.2 Opportunity

A single trusted conversational agent that:
- Executes rituals (morning brief, reminders)
- Logs commitments with audit trail
- Routes domain depth silently
- Respects LifeOS invariants

---

## 4. Business objectives

| ID | Objective | KPI | Target |
|----|-----------|-----|--------|
| BO-1 | Reduce daily app-switching | Self-reported friction | Qualitative: "one surface for log + plan" |
| BO-2 | Reliable morning ritual | Brief delivery rate | ≥95% on scheduled days (user timezone) |
| BO-3 | Commitment capture | Events logged per week | Trend up; reschedule chains preserved |
| BO-4 | Health data continuity | Meal + workout logs | ≥5 days/week when active |
| BO-5 | Operational trust | Unplanned downtime | <1h/month (excluding provider outages) |
| BO-6 | Cost predictability | Monthly API + infra spend | Within agreed budget band |

---

## 5. Scope

### 5.1 In scope (current product)

- Telegram as primary interface
- Magnus orchestrator with four pillar specialists
- Google Calendar + YouTube (per-user OAuth)
- Notion journal and list mirror (per-user OAuth)
- Hevy workout read/write (per-user API key)
- Zerodha Kite portfolio read-only (per-user OAuth)
- Event log with reminders and calendar sync
- Meal logging with macro estimation
- Morning brief and event reminders (proactive)
- Multi-user provisioning on single deployment

### 5.2 Out of scope (explicit)

- Equity/MF order execution (blocked by Zerodha permissions + policy)
- WhatsApp or other messengers (this repo)
- Public SaaS multi-tenancy with billing
- Mobile native app
- Real-time collaborative editing
- Medical diagnosis or regulated health advice

### 5.3 Future consideration

- Web dashboard for review and configuration
- Semantic memory (embeddings)
- Deviation detection and operating modes
- Activity/inactivity proactive triggers
- Wealth budget ingestion (bank connectors)

---

## 6. Business rules (LifeOS)

| Rule | Business implication for Magnus |
|------|-------------------------------|
| One focus per pillar | Magnus should not suggest stacking new commitments when pillar is overloaded |
| No cross-pillar dependencies | Scoring/coaching in one pillar must not excuse another |
| Joy tank | Happiness reserve is meta-signal; low tank → ease pressure |
| Locked day | Morning brief sets plan; intraday changes go through event log |
| Balance penalty | System-wide flag when any pillar below threshold |
| MVD emergency | Reduced expectations mode with debt tracking |

*Note: Several rules have schema support but incomplete runtime enforcement — tracked as product debt.*

---

## 7. Constraints

| Type | Constraint |
|------|------------|
| **Privacy** | Single-user data must not leak across `user_profile_id` |
| **Secrets** | OAuth tokens in Supabase; platform keys in env only |
| **Compliance** | Personal use; not a regulated financial or medical product |
| **Provider limits** | Telegram message size, Anthropic rate limits, Google API quotas |
| **Cost** | Claude Sonnet for all turns — monitor token usage per user |

---

## 8. Assumptions

1. User has Telegram and accepts HTML-formatted replies.
2. Operator can run Railway (or equivalent) with HTTPS for OAuth callbacks.
3. Supabase project remains the single Postgres instance.
4. English is the primary interaction language.
5. Owner provisions integrations via scripts or in-chat OAuth.

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LLM hallucination on calendar | Medium | High | Read-before-write calendar rule |
| Service role key leak | Low | Critical | Rotation, secret manager, no client exposure |
| Provider API outage | Medium | Medium | Graceful degradation messages |
| Auto-allowlist abuse | Medium | High | Disable in production; explicit provision |
| Schema drift | High | Medium | Baseline migrations (cleanup plan) |
| Cost overrun (tokens) | Medium | Medium | Rate limits, memory window tuning |

---

## 10. Success criteria (release gates)

| Milestone | Criteria |
|-----------|----------|
| **MVP (shipped)** | Telegram turn loop, health meal log, chat persistence |
| **v1.0 (current)** | Event log, proactive brief, Google/Notion/Hevy/Kite integrations |
| **v1.1** | Schema reproducible; production allowlist hardened |
| **v1.2** | LifeOS table writers OR reads removed; joy tank wired |
| **v2.0** | Semantic memory; deviation detection L1–L2 |

---

## 11. Approval

| Role | Name | Date |
|------|------|------|
| Product owner | — | 2026-08-04 |
| Technical lead | — | 2026-08-04 |

---

## 12. Related documents

- `docs/product/VISION.md` — long-term direction
- `docs/product/PRD.md` — feature requirements
- `docs/product/TRD.md` — technical requirements
- `docs/product/ARD.md` — architecture requirements
