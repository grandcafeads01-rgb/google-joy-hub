import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildAuthUrl, getValidAccessToken } from "./google-tokens.server";

/* ------------------------------- Connection ------------------------------- */

export const getGoogleConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("google_connections")
      .select("email, connected_at, scope")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data ?? null;
  });

export const startGoogleOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    const state = `${context.userId}.${crypto.randomUUID()}`;
    const url = buildAuthUrl(data.origin, state);
    return { url };
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await supabaseAdmin
      .from("google_connections")
      .delete()
      .eq("user_id", context.userId);
    return { ok: true };
  });

/* ---------------------------------- Gmail --------------------------------- */

async function gmailFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://gmail.googleapis.com${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`Gmail ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  subject: string;
  date: string;
  unread: boolean;
}

export const listGmailMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const token = await getValidAccessToken(context.userId);
      const list = (await gmailFetch(
        token,
        "/gmail/v1/users/me/messages?maxResults=20&labelIds=INBOX",
      )) as { messages?: { id: string; threadId: string }[] };

      const ids = list.messages ?? [];
      const messages: GmailMessage[] = await Promise.all(
        ids.map(async (m) => {
          const full = (await gmailFetch(
            token,
            `/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          )) as {
            id: string;
            threadId: string;
            snippet: string;
            labelIds: string[];
            payload: { headers: { name: string; value: string }[] };
          };
          const header = (n: string) =>
            full.payload.headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";
          return {
            id: full.id,
            threadId: full.threadId,
            snippet: full.snippet,
            from: header("From"),
            subject: header("Subject") || "(no subject)",
            date: header("Date"),
            unread: full.labelIds?.includes("UNREAD") ?? false,
          };
        }),
      );
      return { connected: true as const, messages };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "NO_GOOGLE_CONNECTION") return { connected: false as const, messages: [] };
      throw e;
    }
  });

/* ---------------------------------- Drive --------------------------------- */

async function driveFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://www.googleapis.com${path}`, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive ${path}: ${res.status} ${await res.text()}`);
  return res;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  iconLink?: string;
  webViewLink?: string;
}

export const listDriveFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ folderId: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    try {
      const token = await getValidAccessToken(context.userId);
      const parent = data.folderId ?? "root";
      const q = encodeURIComponent(`'${parent}' in parents and trashed = false`);
      const fields = encodeURIComponent(
        "files(id,name,mimeType,modifiedTime,size,iconLink,webViewLink)",
      );
      const res = await driveFetch(
        token,
        `/drive/v3/files?q=${q}&fields=${fields}&pageSize=100&orderBy=folder,name`,
      );
      const json = (await res.json()) as { files: DriveFile[] };
      return { connected: true as const, files: json.files ?? [], folderId: parent };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "NO_GOOGLE_CONNECTION")
        return { connected: false as const, files: [] as DriveFile[], folderId: "root" };
      throw e;
    }
  });

export const createDriveFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().min(1).max(255),
        parentId: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const token = await getValidAccessToken(context.userId);
    const res = await driveFetch(token, "/drive/v3/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        mimeType: "application/vnd.google-apps.folder",
        parents: data.parentId ? [data.parentId] : undefined,
      }),
    });
    return await res.json();
  });

export const uploadDriveFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().min(1).max(255),
        mimeType: z.string().min(1),
        // base64-encoded file contents
        contentBase64: z.string().min(1),
        parentId: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const token = await getValidAccessToken(context.userId);
    const metadata = {
      name: data.name,
      parents: data.parentId ? [data.parentId] : undefined,
    };
    const boundary = `lov_${crypto.randomUUID()}`;
    const fileBytes = Buffer.from(data.contentBase64, "base64");
    const head = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
        metadata,
      )}\r\n--${boundary}\r\nContent-Type: ${data.mimeType}\r\n\r\n`,
      "utf8",
    );
    const tail = Buffer.from(`\r\n--${boundary}--`, "utf8");
    const body = Buffer.concat([head, fileBytes, tail]);

    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Content-Length": String(body.length),
        },
        body,
      },
    );
    if (!res.ok) {
      throw new Error(`Drive upload failed: ${res.status} ${await res.text()}`);
    }
    return await res.json();
  });

export const getDriveDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ fileId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    // Return a short-lived download URL that includes the access token.
    // Browser fetches via /api/google/download to avoid leaking the token.
    const token = await getValidAccessToken(context.userId);
    // Sanity-check the file exists
    const res = await driveFetch(
      token,
      `/drive/v3/files/${encodeURIComponent(data.fileId)}?fields=name,mimeType`,
    );
    const meta = (await res.json()) as { name: string; mimeType: string };
    return {
      downloadPath: `/api/google/download?fileId=${encodeURIComponent(data.fileId)}`,
      name: meta.name,
      mimeType: meta.mimeType,
    };
  });
