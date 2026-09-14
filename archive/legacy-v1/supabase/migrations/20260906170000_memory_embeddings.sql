-- Step 4 — semantic recall (pgvector) for on-demand memory search.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.memory_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(384) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT memory_embeddings_source_nonempty CHECK (char_length(trim(source_type)) > 0),
  CONSTRAINT memory_embeddings_chunk_nonempty CHECK (char_length(trim(chunk_text)) > 0),
  CONSTRAINT memory_embeddings_user_source UNIQUE (user_profile_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_embeddings_user_created
  ON public.memory_embeddings (user_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_embeddings_hnsw
  ON public.memory_embeddings
  USING hnsw (embedding vector_cosine_ops);

ALTER TABLE public.memory_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.memory_embeddings;
CREATE POLICY service_role_only ON public.memory_embeddings
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.memory_embeddings IS
  'Embedded memory chunks for recall_context (Layer 2 only).';
COMMENT ON COLUMN public.memory_embeddings.source_type IS
  'journal | topic | chat_turn';

-- Cosine similarity search scoped to one user.
CREATE OR REPLACE FUNCTION public.match_memory_embeddings(
  p_user_profile_id UUID,
  query_embedding vector(384),
  match_count INT DEFAULT 5,
  since_ts TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  source_type TEXT,
  source_id TEXT,
  chunk_text TEXT,
  similarity DOUBLE PRECISION,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    me.id,
    me.source_type,
    me.source_id,
    me.chunk_text,
    1 - (me.embedding <=> query_embedding) AS similarity,
    me.created_at
  FROM public.memory_embeddings me
  WHERE me.user_profile_id = p_user_profile_id
    AND (since_ts IS NULL OR me.created_at >= since_ts)
  ORDER BY me.embedding <=> query_embedding
  LIMIT GREATEST(1, LEAST(match_count, 20));
$$;

REVOKE ALL ON FUNCTION public.match_memory_embeddings(UUID, vector, INT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_memory_embeddings(UUID, vector, INT, TIMESTAMPTZ) TO service_role;
