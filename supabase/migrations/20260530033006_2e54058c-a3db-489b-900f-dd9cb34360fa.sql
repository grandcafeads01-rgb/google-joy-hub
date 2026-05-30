
ALTER TABLE public.google_connections
  DROP COLUMN connection_id,
  ADD COLUMN access_token TEXT NOT NULL,
  ADD COLUMN refresh_token TEXT,
  ADD COLUMN expires_at TIMESTAMPTZ NOT NULL,
  ADD COLUMN scope TEXT NOT NULL,
  ADD COLUMN email TEXT;
