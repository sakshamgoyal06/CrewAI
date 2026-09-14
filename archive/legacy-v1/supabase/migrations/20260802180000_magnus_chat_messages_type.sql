-- Classify chat log rows: conversation vs automated, and how automated sends were triggered.

ALTER TABLE public.magnus_chat_messages
  ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'conversation',
  ADD COLUMN IF NOT EXISTS delivery_trigger TEXT;

COMMENT ON COLUMN public.magnus_chat_messages.message_type IS
  'conversation = normal user/Magnus turn; automated = Magnus-initiated outbound.';

COMMENT ON COLUMN public.magnus_chat_messages.delivery_trigger IS
  'For automated rows: manual, scheduled, http, event_reminder, system, inactivity, activity. '
  'For conversation user rows that request a ritual: manual. Otherwise null.';

ALTER TABLE public.magnus_chat_messages
  DROP CONSTRAINT IF EXISTS magnus_chat_messages_message_type_check;

ALTER TABLE public.magnus_chat_messages
  ADD CONSTRAINT magnus_chat_messages_message_type_check CHECK (
    message_type IN ('conversation', 'automated')
  );

ALTER TABLE public.magnus_chat_messages
  DROP CONSTRAINT IF EXISTS magnus_chat_messages_delivery_trigger_check;

ALTER TABLE public.magnus_chat_messages
  ADD CONSTRAINT magnus_chat_messages_delivery_trigger_check CHECK (
    delivery_trigger IS NULL
    OR delivery_trigger IN (
      'manual',
      'scheduled',
      'http',
      'event_reminder',
      'system',
      'inactivity',
      'activity'
    )
  );

-- Backfill proactive rows written before columns existed.
UPDATE public.magnus_chat_messages
SET
  message_type = 'automated',
  delivery_trigger = COALESCE(
    delivery_trigger,
    metadata->>'proactive_trigger',
    metadata->>'delivery_trigger'
  )
WHERE message_type = 'conversation'
  AND (
    metadata->>'proactive' = 'true'
    OR metadata ? 'proactive_kind'
  );

CREATE INDEX IF NOT EXISTS idx_magnus_chat_messages_type_created
  ON public.magnus_chat_messages (user_profile_id, message_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_magnus_chat_messages_delivery_trigger
  ON public.magnus_chat_messages (user_profile_id, delivery_trigger, created_at DESC)
  WHERE delivery_trigger IS NOT NULL;
