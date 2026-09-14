/**
 * Chat turn shape for routing context (recent history previews).
 */
export type RoutingChatTurn = {
  role: string;
  content: string;
  metadata?: Record<string, unknown> | null;
};
