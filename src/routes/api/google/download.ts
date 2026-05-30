import { createFileRoute } from "@tanstack/react-router";
import { getValidAccessToken } from "@/lib/google-tokens.server";
import { createSupabaseServerClientFromRequest } from "@/integrations/supabase/auth-middleware";

export const Route = createFileRoute("/api/google/download")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Authenticate via bearer token in cookie/header; reuse auth middleware helper if available.
        const auth = request.headers.get("authorization");
        let userId: string | null = null;
        if (auth?.startsWith("Bearer ")) {
          // Validate via Supabase
          const sb = createSupabaseServerClientFromRequest?.(request);
          if (sb) {
            const { data } = await sb.auth.getUser();
            userId = data.user?.id ?? null;
          }
        }
        if (!userId) {
          return new Response("Unauthorized", { status: 401 });
        }

        const url = new URL(request.url);
        const fileId = url.searchParams.get("fileId");
        if (!fileId) return new Response("Missing fileId", { status: 400 });

        const token = await getValidAccessToken(userId);
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) return new Response(await res.text(), { status: res.status });
        return new Response(res.body, {
          status: 200,
          headers: {
            "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
            "Content-Disposition": `attachment`,
          },
        });
      },
    },
  },
});
