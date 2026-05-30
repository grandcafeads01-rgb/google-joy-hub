
CREATE TABLE public.google_connections (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_connections TO authenticated;
GRANT ALL ON public.google_connections TO service_role;

ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users select own google connection"
  ON public.google_connections FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users insert own google connection"
  ON public.google_connections FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users update own google connection"
  ON public.google_connections FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "users delete own google connection"
  ON public.google_connections FOR DELETE TO authenticated
  USING (user_id = auth.uid());
