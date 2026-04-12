/**
 * Memory-layer context for Morning Brief (tiered facts from Supabase).
 * Re-exports the job context fetch for orchestrator / future Memory agent merge.
 */
export {
  fetchMorningBriefContext,
  buildMorningBriefUserMessage,
  type MorningBriefContextBundle,
} from "../../jobs/morningBriefContext.js";
