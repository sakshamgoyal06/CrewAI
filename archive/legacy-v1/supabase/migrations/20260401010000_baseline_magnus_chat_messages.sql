-- Baseline: chat history (previously hosted-only).
-- message_type / delivery_trigger constraints added in 20260802180000.

CREATE TABLE IF NOT EXISTS public.magnus_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  telegram_user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'telegram',
  intent TEXT,
  metadata JSONB,
  message_type TEXT NOT NULL DEFAULT 'conversation',
  delivery_trigger TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_magnus_chat_messages_user_created
  ON public.magnus_chat_messages (user_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_magnus_chat_messages_telegram_created
  ON public.magnus_chat_messages (telegram_user_id, created_at DESC);

ALTER TABLE public.magnus_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.magnus_chat_messages;
CREATE POLICY service_role_only ON public.magnus_chat_messages
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.magnus_chat_messages IS
  'Full chat log. Routing metadata (delegated_agent, intent) is internal — never shown to the user.';
