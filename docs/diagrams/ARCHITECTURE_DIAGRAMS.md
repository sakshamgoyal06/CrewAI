# Magnus — Architecture Diagrams

**Purpose:** Visual reference for system topology, request flow, data flow, and deployment.  
**Companion:** `docs/ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, `magnus.md`  
**Last updated:** 2026-08-04

---

## 1. System context (C4 Level 1)

```mermaid
C4Context
    title Magnus — System Context

    Person(user, "User", "Telegram user")
    System(magnus, "Magnus Bot", "AI chief of staff — single voice, four pillars")
    
    System_Ext(telegram, "Telegram", "Bot API")
    System_Ext(anthropic, "Anthropic", "Claude API")
    System_Ext(supabase, "Supabase", "Postgres")
    System_Ext(redis, "Upstash Redis", "Rate limit, dedupe, OAuth state")
    System_Ext(google, "Google", "Calendar + YouTube")
    System_Ext(notion, "Notion", "Journal, lists, brief pages")
    System_Ext(hevy, "Hevy", "Workout tracking")
    System_Ext(kite, "Zerodha Kite", "Portfolio read-only")
    System_Ext(usda, "USDA / CalorieNinjas", "Meal macros")

    Rel(user, telegram, "Messages")
    Rel(telegram, magnus, "Webhook / polling")
    Rel(magnus, anthropic, "Classification + agents")
    Rel(magnus, supabase, "Persistence")
    Rel(magnus, redis, "Ephemeral state")
    Rel(magnus, google, "OAuth + APIs")
    Rel(magnus, notion, "OAuth + APIs")
    Rel(magnus, hevy, "REST API")
    Rel(magnus, kite, "OAuth + REST")
    Rel(magnus, usda, "Macro lookup")
```

---

## 2. Container diagram (C4 Level 2)

```mermaid
flowchart TB
    subgraph process["Magnus Node.js Process (single replica)"]
        IDX[index.ts<br/>Boot + shutdown]
        TG[tools/telegram.ts<br/>Webhook / polling]
        MG[magnus.ts<br/>Turn handler]
        OR[magnusOrchestrator.ts<br/>Classify + route]
        MA[magnusAgent.ts<br/>Tools loop]
        PS[Pillar specialists<br/>Health / Wealth / Joy / Wisdom]
        MEM[memoryAgent.ts<br/>Load + maintain]
        PC[proactive/cron.ts<br/>Scheduled outbound]
        HS[healthServer.ts<br/>Express HTTP]
    end

    subgraph external["External Services"]
        TAPI[Telegram Bot API]
        CLAUDE[Anthropic Claude]
        SB[(Supabase Postgres)]
        RD[(Upstash Redis)]
        GAPI[Google APIs]
        NAPI[Notion API]
        HAPI[Hevy API]
        KAPI[Kite API]
    end

    TAPI <--> TG
    TG --> MG
    MG --> OR
    OR --> CLAUDE
    OR --> MEM
    OR --> MA
    OR --> PS
    MA --> GAPI
    MA --> NAPI
    MA --> KAPI
    PS --> HAPI
    PS --> CLAUDE
    MG --> SB
    MA --> SB
    PS --> SB
    MEM --> SB
    TG --> RD
    PC --> TAPI
    PC --> SB
    HS --> TG
    HS --> GAPI
    HS --> NAPI
    HS --> KAPI
    IDX --> TG
    IDX --> HS
    IDX --> PC
```

---

## 3. Request flow — user message

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant TG as Telegram
    participant TR as telegram.ts
    participant RD as Redis
    participant MG as magnus.ts
    participant SB as Supabase
    participant OR as Orchestrator
    participant AG as Agent
    participant CL as Claude

    U->>TG: Send message
    TG->>TR: Update (webhook/poll)
    TR->>RD: Claim update_id (dedupe)
    alt duplicate
        TR-->>TG: 200 OK (no-op)
    end
    TR->>RD: Rate limit check
  alt not allowlisted
        TR->>MG: handleMessage
        MG->>SB: resolveTelegramUserProfile
        MG-->>TR: Refusal HTML
    else allowlisted
        TR->>MG: handleMessage
        MG->>SB: Persist user turn
        MG->>OR: runOrchestratorReply
        OR->>SB: Load memory context
        OR->>CL: Classify intent
        alt GENERAL
            OR->>AG: runMagnusAgent (tool loop)
            AG->>CL: Tool use rounds
            AG->>SB: Tool side effects
        else HEALTH / WEALTH / etc.
            OR->>AG: dispatchToAgent
            AG->>CL: Specialist reply
        end
        OR-->>MG: replyText + metadata
        MG->>SB: Persist assistant turn
        MG->>SB: Post-turn memory maintenance
        MG-->>TR: HTML chunks
        TR->>TG: sendMessage (HTML)
        TG->>U: Reply
    end
```

---

## 4. Agent routing decision tree

```mermaid
flowchart TD
    START[User message] --> CMD{/start or /help?}
    CMD -->|yes| LOCAL[Local HTML — no model]
    CMD -->|no| GATE[Allowlist + tier gate]
    GATE -->|denied| REFUSE[Fixed refusal]
    GATE -->|ok| MEAL{Explicit meal log?}
    MEAL -->|no| ONB{Health onboarding incomplete?}
    ONB -->|yes| HOB[HealthOnboarding agent]
    ONB -->|no| CLS[LLM classify intent]
    MEAL -->|yes| CLS
    CLS --> INTENT{Intent}
    INTENT -->|GENERAL| MAG[Magnus agent + tools]
    INTENT -->|HEALTH| HR[Health router]
    INTENT -->|WEALTH| WA[Wealth agent + Kite context]
    INTENT -->|HAPPINESS| PA[Pillar specialist prompt]
    INTENT -->|WISDOM| PA
    HR --> H1[Meal log handler]
    HR --> H2[Journal handler]
    HR --> H3[Hevy write]
    HR --> H4[Fitness + Hevy read]
    HR --> H5[Nutrition advice]
    MAG --> REPLY[Single reply — metadata internal]
    HOB --> REPLY
    WA --> REPLY
    PA --> REPLY
    H1 --> REPLY
    H2 --> REPLY
    H3 --> REPLY
    H4 --> REPLY
    H5 --> REPLY
```

---

## 5. Health sub-router (first-accept)

```mermaid
flowchart LR
    MSG[Health intent message] --> M{Meal command?}
    M -->|yes| ML[recordMealLog]
    M -->|no| J{Journal phrasing?}
    J -->|yes| HJ[healthJournalStore]
    J -->|no| W{Hevy write command?}
    W -->|yes| HW[hevyWriteAgent]
    W -->|no| F{Training / gym?}
    F -->|yes| FA[fitnessAgent + Hevy read]
    F -->|no| N[Nutrition agent]
    ML --> OUT[Reply]
    HJ --> OUT
    HW --> OUT
    FA --> OUT
    N --> OUT
```

---

## 6. Magnus tool surface

```mermaid
mindmap
  root((Magnus Tools))
    Calendar
      read_calendar
      create_calendar_event
      update_calendar_event
      delete_calendar_event
    Event Log
      log_event
      update_event
      reschedule_event
      list_events
    Journal
      log_note
    YouTube
      youtube_search
      youtube_playlist
      youtube_bookmark
      youtube_cue
      connect_google
    Notion
      connect_notion
      setup_notion
    Lists
      list_catalog
      read_list
      add_list_item
      update_list_item
      create_list
    Wealth
      connect_kite
```

---

## 7. OAuth flows

```mermaid
sequenceDiagram
    participant U as User (Telegram)
    participant M as Magnus
    participant HS as healthServer
    participant RD as Redis
    participant P as Provider

    U->>M: "connect google"
    M->>RD: Store OAuth state (15m TTL)
    M->>U: Authorization link
    U->>HS: GET /oauth/google/callback?code&state
    HS->>RD: Validate + consume state
    HS->>P: Exchange code for tokens
    HS->>SB: Upsert user_integrations
    HS->>U: Success HTML page
```

**Providers:** Google (Calendar + YouTube unified), Notion, Zerodha Kite.

---

## 8. Proactive messaging

```mermaid
flowchart TB
    CRON[node-cron tick<br/>every N minutes] --> REG[proactive/registry.ts]
    REG --> MB{Morning brief job}
    REG --> ER{Event reminder job}
    MB --> WIN[Local hour window<br/>user_profile.timezone]
    WIN --> DED1[Redis dedupe per day]
    DED1 --> GEN[jobs/morningBrief.ts<br/>generate content]
    GEN --> OUT[outboundTelegraf.ts]
    ER --> QEY[Query magnus_events<br/>remind_at <= now]
    QEY --> DED2[Redis dedupe per event]
    DED2 --> OUT
    OUT --> TG[Telegram sendMessage HTML]
    OUT --> LOG[magnus_chat_messages<br/>message_type=automated]
```

---

## 9. Memory architecture

```mermaid
flowchart LR
    subgraph inputs["Per-turn inputs"]
        CHAT[Recent chat window<br/>magnus_chat_messages]
        SUM[Rolling summary<br/>memory_summaries]
        FACTS[Semantic facts<br/>memory_summaries]
        PROF[user_profile fields]
        EV[magnus_events open]
        LOGS[magnus_daily_logs]
        LIFE[LifeOS tables<br/>goals, patterns, …]
    end

    subgraph assembly["memoryAgent.ts"]
        PKG[MemoryPackage]
    end

    subgraph maintenance["Post-turn"]
        UPD[Update rolling summary]
        EXT[Extract semantic facts]
    end

    CHAT --> PKG
    SUM --> PKG
    FACTS --> PKG
    PROF --> PKG
    EV --> PKG
    LOGS --> PKG
    LIFE -.->|often empty| PKG
    PKG --> AGENT[Injected into agent system/user]
    AGENT --> UPD
    AGENT --> EXT
    UPD --> SUM
    EXT --> FACTS
```

---

## 10. Deployment topology

```mermaid
flowchart TB
    subgraph railway["Railway (production)"]
        DOCKER[Docker container<br/>Node 20 Alpine]
        ENV[Env vars<br/>6 required + OAuth apps]
    end

    subgraph health["Health checks"]
        HC1[GET /health — liveness]
        HC2[GET /ready — Redis + Supabase]
    end

    subgraph telegram_mode["Telegram mode"]
        WH[Webhook POST<br/>/telegram/hash]
        POLL[Long polling<br/>dev only]
    end

    USER[Telegram users] --> WH
    DOCKER --> HC1
    DOCKER --> HC2
    DOCKER --> WH
    WATCH[telegramWatchdog<br/>60s probe] --> DOCKER
    EXT_UP[External uptime<br/>recommended] --> HC2
```

---

## 11. Five-layer target vs current

| Layer | Target (LifeOS vision) | Current implementation |
|-------|------------------------|------------------------|
| 5 — Interface | Telegram + future web | **Telegram only** |
| 4 — Orchestrator | Route, delegate, synthesize | **magnusOrchestrator.ts** ✓ |
| 3 — Agent layer | Deep pillar specialists | **Health deep; others shallow** |
| 2 — Tools | Per-domain APIs | **Magnus tools + Health APIs** |
| 1 — Memory | Postgres + pgvector + Redis | **Postgres + Redis; no vectors** |

---

## 12. Pillar / intent / DB mapping

| User-facing pillar | Intent enum | Event log `pillar` | Agent module |
|--------------------|-------------|-------------------|--------------|
| Magnus (cross-cutting) | `GENERAL` | `magnus` | `magnusAgent.ts` |
| Health | `HEALTH` | `health` | `healthRouter.ts` |
| Wealth | `WEALTH` | `wealth` | `wealthAgent.ts` |
| Happiness (Joy) | `HAPPINESS` | `joy` | `pillarSpecialist.ts` |
| Wisdom | `WISDOM` | `wisdom` | `pillarSpecialist.ts` |

**Note:** LifeOS philosophy uses "Joy"; code uses `HAPPINESS` intent. DB events use `joy`.
