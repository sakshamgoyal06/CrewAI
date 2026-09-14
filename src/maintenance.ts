export const MAINTENANCE_MESSAGE =
  "Magnus is temporarily offline while we rebuild (v2 clean-room). " +
  "Your v1 data in Supabase is unchanged; this bot no longer runs the old assistant. " +
  "We'll be back on the new architecture soon.";

export type MaintenanceStatus = {
  status: "maintenance";
  magnus: "v1_retired";
  v2_plan: "docs/product/MAGNUS_V2_21_DAY_BUILD_PLAN.md";
  message: string;
};

export function maintenanceStatus(): MaintenanceStatus {
  return {
    status: "maintenance",
    magnus: "v1_retired",
    v2_plan: "docs/product/MAGNUS_V2_21_DAY_BUILD_PLAN.md",
    message: MAINTENANCE_MESSAGE,
  };
}
