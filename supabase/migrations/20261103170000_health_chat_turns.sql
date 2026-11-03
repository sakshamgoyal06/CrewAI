-- Coach chat turns: a client-generated turn id ties a person's message to its reply, so a retry
-- after a timeout replays the stored reply instead of logging twice, and a message whose reply
-- failed is marked instead of sitting in history as if it were still waiting for an answer.
ALTER TABLE public.health_chat_messages
  ADD COLUMN IF NOT EXISTS turn_id UUID,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ok'
    CHECK (status IN ('ok', 'pending', 'failed'));

COMMENT ON COLUMN public.health_chat_messages.turn_id IS
  'Client-generated id shared by a user message and its reply. NULL for rows written before turn ids, and for coach messages posted by the scheduler.';
COMMENT ON COLUMN public.health_chat_messages.status IS
  'User rows: pending while the coach is answering, ok once the reply is stored, failed when the turn errored. Assistant rows are always ok.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_health_chat_messages_turn
  ON public.health_chat_messages (user_profile_id, turn_id, role)
  WHERE turn_id IS NOT NULL;
