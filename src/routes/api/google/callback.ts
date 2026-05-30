import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { exchangeCode, getUserEmail } from "@/lib/google-tokens.server";

export const Route = createFileRoute("/api/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          return Response.redirect(
            `${url.origin}/dashboard/settings?google_error=${encodeURIComponent(error)}`,
            302,
          );
        }
        if (!code || !state) {
          return new Response("Missing code or state", { status: 400 });
        }

        const userId = state.split(".")[0];
        if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
          return new Response("Invalid state", { status: 400 });
        }

        try {
          const tokens = await exchangeCode(code, url.origin);
          const email = await getUserEmail(tokens.access_token);
          const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

          // Upsert; preserve refresh_token if Google didn't send a new one
          const existing = await supabaseAdmin
            .from("google_connections")
            .select("refresh_token")
            .eq("user_id", userId)
            .maybeSingle();

          const refreshToken =
            tokens.refresh_token ?? existing.data?.refresh_token ?? null;

          await supabaseAdmin
            .from("google_connections")
            .upsert(
              {
                user_id: userId,
                access_token: tokens.access_token,
                refresh_token: refreshToken,
                expires_at: expiresAt,
                scope: tokens.scope,
                email,
                connected_at: new Date().toISOString(),
              },
              { onConflict: "user_id" },
            );

          return Response.redirect(
            `${url.origin}/dashboard/settings?google_connected=1`,
            302,
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("Google OAuth callback error:", msg);
          return Response.redirect(
            `${url.origin}/dashboard/settings?google_error=${encodeURIComponent(msg)}`,
            302,
          );
        }
      },
    },
  },
});
