/**
 * JSON API behind the health PWA, mounted on the existing Express server under `/api/health`.
 * Every route needs `Authorization: Bearer <MAGNUS_HEALTH_APP_TOKEN>`.
 */
import express from "express";
import { z } from "zod";

import { logger } from "../logger.js";
import { estimateMealNutrition } from "../meals/estimateMealNutrition.js";
import { recordMealSession } from "../meals/recordMealLog.js";
import { localDateKey } from "../nutrition/localDate.js";
import { loggableError } from "../util/loggableError.js";
import { ACTIVITY_SOURCES, upsertDailyActivity } from "./activityStore.js";
import { authenticateHealthApp, healthAppAuthConfig } from "./auth.js";
import { buildHealthSnapshot, loadHealthProfile } from "./snapshot.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const stepsBody = z.object({
  date: z.string().regex(DATE_RE).optional(),
  steps: z.coerce.number().int().min(0).max(200_000),
  walkMinutes: z.coerce.number().int().min(0).max(1440).optional(),
  walkDistanceM: z.coerce.number().int().min(0).max(500_000).optional(),
  source: z.enum(ACTIVITY_SOURCES).optional(),
});

const mealBody = z.object({
  text: z.string().trim().min(2).max(500),
  slot: z.enum(["breakfast", "lunch", "dinner", "snack", "unspecified"]).optional(),
});

type AuthedLocals = { userProfileId: string };

export function createHealthAppRouter(): express.Router {
  const router = express.Router();

  router.use((req, res, next) => {
    const userProfileId = authenticateHealthApp(req.get("authorization"), healthAppAuthConfig());
    if (!userProfileId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    (res.locals as AuthedLocals).userProfileId = userProfileId;
    next();
  });

  router.get("/today", async (_req, res) => {
    const { userProfileId } = res.locals as AuthedLocals;
    try {
      res.status(200).json(await buildHealthSnapshot(userProfileId));
    } catch (err) {
      logger.error({ err: loggableError(err) }, "health app snapshot failed");
      res.status(500).json({ error: "snapshot_failed" });
    }
  });

  /** Steps ingest: the PWA's manual entry and phone automations (iOS Shortcut, Health Auto Export). */
  router.post("/steps", async (req, res) => {
    const parsed = stepsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
      return;
    }
    const { userProfileId } = res.locals as AuthedLocals;
    try {
      const { timezone } = await loadHealthProfile(userProfileId);
      const today = localDateKey(new Date(), timezone);
      const date = parsed.data.date ?? today;
      if (date > today) {
        res.status(400).json({ error: "future_date" });
        return;
      }
      const saved = await upsertDailyActivity(userProfileId, {
        localDate: date,
        steps: parsed.data.steps,
        walkMinutes: parsed.data.walkMinutes ?? null,
        walkDistanceM: parsed.data.walkDistanceM ?? null,
        source: parsed.data.source ?? "api",
      });
      if (!saved.ok) {
        logger.warn({ error: saved.error }, "health app steps upsert failed");
        res.status(500).json({ error: "save_failed" });
        return;
      }
      res.status(200).json({ ok: true, date, steps: parsed.data.steps });
    } catch (err) {
      logger.error({ err: loggableError(err) }, "health app steps failed");
      res.status(500).json({ error: "save_failed" });
    }
  });

  /** Free-text meal log through the same estimator chain and `meal_logs` table as Telegram. */
  router.post("/meals", async (req, res) => {
    const parsed = mealBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
      return;
    }
    const { userProfileId } = res.locals as AuthedLocals;
    try {
      const { timezone } = await loadHealthProfile(userProfileId);
      const estimate = await estimateMealNutrition(parsed.data.text);
      const saved = await recordMealSession({
        userProfileId,
        rawText: parsed.data.text,
        estimate,
        sourceChannel: "api",
        timezone,
        mealSlot: parsed.data.slot ?? "unspecified",
      });
      if (!saved.ok) {
        logger.warn({ error: saved.error }, "health app meal save failed");
        res.status(500).json({ error: "save_failed" });
        return;
      }
      res.status(200).json({
        ok: true,
        duplicate: saved.duplicateSkipped === true,
        date: saved.date,
        calories: estimate.calories,
        proteinG: estimate.protein_g,
        source: estimate.source,
        items: estimate.items.map((i) => ({ name: i.name, calories: i.calories ?? null })),
      });
    } catch (err) {
      logger.error({ err: loggableError(err) }, "health app meal log failed");
      res.status(500).json({ error: "save_failed" });
    }
  });

  return router;
}
