// Server-only helpers for Google OAuth + token refresh.
// Never import from client bundles.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/content",
].join(" ");

function getClientCreds() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials are not configured.");
  }
  return { clientId, clientSecret };
}

export function getRedirectUri(origin: string) {
  return `${origin}/api/google/callback`;
}

export function buildAuthUrl(origin: string, state: string) {
  const { clientId } = getClientCreds();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(origin),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_SCOPES,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCode(code: string, origin: string) {
  const { clientId, clientSecret } = getClientCreds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getRedirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
    id_token?: string;
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getClientCreds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };
}

export async function getUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { email?: string };
  return json.email ?? null;
}

/** Get a valid access token for the user, refreshing if needed. */
export async function getValidAccessToken(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("google_connections")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("NO_GOOGLE_CONNECTION");

  const expiresAt = new Date(data.expires_at).getTime();
  // Refresh if expiring within 60s
  if (expiresAt - Date.now() > 60_000) {
    return data.access_token;
  }
  if (!data.refresh_token) {
    throw new Error("NO_GOOGLE_CONNECTION");
  }
  const refreshed = await refreshAccessToken(data.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabaseAdmin
    .from("google_connections")
    .update({
      access_token: refreshed.access_token,
      expires_at: newExpiresAt,
      scope: refreshed.scope,
    })
    .eq("user_id", userId);
  return refreshed.access_token;
}
