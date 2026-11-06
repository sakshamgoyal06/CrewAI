-- The phone's receipt for each push: when the service worker got it, and whether it was shown.
-- Before this, "delivered" only meant Google's push service accepted the message.
ALTER TABLE public.health_notifications
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shown BOOLEAN,
  ADD COLUMN IF NOT EXISTS show_error TEXT;
