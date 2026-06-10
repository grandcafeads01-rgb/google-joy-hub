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

const FOLDER_LABELS = {
  inbox: "INBOX",
  sent: "SENT",
  drafts: "DRAFT",
  spam: "SPAM",
} as const;
export type GmailFolder = keyof typeof FOLDER_LABELS;

export const listGmailMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ folder: z.enum(["inbox", "sent", "drafts", "spam"]).optional() })
      .optional()
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const folder: GmailFolder = data?.folder ?? "inbox";
    const label = FOLDER_LABELS[folder];
    try {
      const token = await getValidAccessToken(context.userId);
      const list = (await gmailFetch(
        token,
        `/gmail/v1/users/me/messages?maxResults=30&labelIds=${label}`,
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

export interface GmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface GmailMessageDetail {
  id: string;
  threadId: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  messageIdHeader: string;
  references: string;
  bodyHtml: string;
  bodyText: string;
  attachments: GmailAttachment[];
}

interface GmailPart {
  partId?: string;
  mimeType: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}

function decodeB64Url(s: string): string {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm.length % 4 ? norm + "=".repeat(4 - (norm.length % 4)) : norm;
  try {
    return new TextDecoder("utf-8").decode(Buffer.from(pad, "base64"));
  } catch {
    return "";
  }
}

function walkParts(
  part: GmailPart,
  out: { html: string; text: string; attachments: GmailAttachment[] },
) {
  const isAttachment =
    !!part.filename && !!part.body?.attachmentId;
  if (isAttachment) {
    out.attachments.push({
      attachmentId: part.body!.attachmentId!,
      filename: part.filename!,
      mimeType: part.mimeType,
      size: part.body?.size ?? 0,
    });
  } else if (part.mimeType === "text/html" && part.body?.data) {
    out.html += decodeB64Url(part.body.data);
  } else if (part.mimeType === "text/plain" && part.body?.data) {
    out.text += decodeB64Url(part.body.data);
  }
  if (part.parts) part.parts.forEach((p) => walkParts(p, out));
}

export const getGmailMessage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const token = await getValidAccessToken(context.userId);
    const full = (await gmailFetch(
      token,
      `/gmail/v1/users/me/messages/${encodeURIComponent(data.id)}?format=full`,
    )) as {
      id: string;
      threadId: string;
      payload: GmailPart;
    };
    const out = { html: "", text: "", attachments: [] as GmailAttachment[] };
    walkParts(full.payload, out);
    const headers = full.payload.headers ?? [];
    const h = (n: string) =>
      headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? "";

    // Mark as read
    await gmailFetch(token, `/gmail/v1/users/me/messages/${full.id}/modify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
    }).catch(() => null);

    const result: GmailMessageDetail = {
      id: full.id,
      threadId: full.threadId,
      from: h("From"),
      to: h("To"),
      cc: h("Cc"),
      subject: h("Subject") || "(no subject)",
      date: h("Date"),
      messageIdHeader: h("Message-ID"),
      references: h("References"),
      bodyHtml: out.html,
      bodyText: out.text,
      attachments: out.attachments,
    };
    return result;
  });

export const getGmailAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      messageId: z.string().min(1),
      attachmentId: z.string().min(1),
      filename: z.string().min(1),
      mimeType: z.string().min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const token = await getValidAccessToken(context.userId);
    const res = (await gmailFetch(
      token,
      `/gmail/v1/users/me/messages/${encodeURIComponent(data.messageId)}/attachments/${encodeURIComponent(data.attachmentId)}`,
    )) as { data: string; size: number };
    // Convert b64url -> b64
    const b64 = res.data.replace(/-/g, "+").replace(/_/g, "/");
    return { filename: data.filename, mimeType: data.mimeType, base64: b64 };
  });

function toB64Url(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const sendGmailMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      to: z.string().min(1).max(2000),
      cc: z.string().max(2000).optional(),
      bcc: z.string().max(2000).optional(),
      subject: z.string().max(998),
      body: z.string().max(500_000),
      threadId: z.string().optional(),
      inReplyTo: z.string().optional(),
      references: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const token = await getValidAccessToken(context.userId);
    const lines: string[] = [];
    lines.push(`To: ${data.to}`);
    if (data.cc) lines.push(`Cc: ${data.cc}`);
    if (data.bcc) lines.push(`Bcc: ${data.bcc}`);
    lines.push(`Subject: ${data.subject}`);
    if (data.inReplyTo) lines.push(`In-Reply-To: ${data.inReplyTo}`);
    if (data.references) lines.push(`References: ${data.references}`);
    lines.push("MIME-Version: 1.0");
    lines.push('Content-Type: text/html; charset="UTF-8"');
    lines.push("Content-Transfer-Encoding: 7bit");
    lines.push("");
    lines.push(data.body);
    const raw = toB64Url(lines.join("\r\n"));
    const body: Record<string, string> = { raw };
    if (data.threadId) body.threadId = data.threadId;
    await gmailFetch(token, "/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: true };
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

export const downloadDriveFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ fileId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const token = await getValidAccessToken(context.userId);
    const metaRes = await driveFetch(
      token,
      `/drive/v3/files/${encodeURIComponent(data.fileId)}?fields=name,mimeType,size`,
    );
    const meta = (await metaRes.json()) as { name: string; mimeType: string; size?: string };

    // Don't download huge files through the server function — block above 25MB.
    if (meta.size && Number(meta.size) > 25 * 1024 * 1024) {
      throw new Error("File is larger than 25 MB; download from Drive directly.");
    }

    // Google Docs/Sheets/Slides need export, not alt=media
    const isGoogleDoc = meta.mimeType.startsWith("application/vnd.google-apps");
    const fileRes = isGoogleDoc
      ? await driveFetch(
          token,
          `/drive/v3/files/${encodeURIComponent(data.fileId)}/export?mimeType=application/pdf`,
        )
      : await driveFetch(
          token,
          `/drive/v3/files/${encodeURIComponent(data.fileId)}?alt=media`,
        );

    const buf = Buffer.from(await fileRes.arrayBuffer());
    return {
      name: isGoogleDoc ? `${meta.name}.pdf` : meta.name,
      mimeType: isGoogleDoc ? "application/pdf" : meta.mimeType,
      base64: buf.toString("base64"),
    };
  });

/* ----------------------------- Merchant Center ---------------------------- */

const MC_BASE = "https://shoppingcontent.googleapis.com/content/v2.1";

async function mcFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${MC_BASE}${path}`, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    let msg = body;
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string; status?: string } };
      if (parsed.error?.message) {
        msg = `${parsed.error.status ?? res.status}: ${parsed.error.message}`;
      }
    } catch {
      /* keep raw body */
    }
    throw new Error(`Merchant API (${res.status}) ${msg}`);
  }
  return res.json();
}

export interface MerchantAccount {
  merchantId: string;
  name?: string;
}

export interface MerchantProduct {
  id: string;
  title: string;
  description?: string;
  price?: { value: string; currency: string };
  imageLink?: string;
  availability?: string;
  link?: string;
  brand?: string;
}

export const listMerchantAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const token = await getValidAccessToken(context.userId);
      const info = (await mcFetch(token, "/accounts/authinfo")) as {
        accountIdentifiers?: { merchantId?: string; aggregatorId?: string }[];
      };
      const ids = (info.accountIdentifiers ?? [])
        .map((a) => a.merchantId ?? a.aggregatorId)
        .filter(Boolean) as string[];
      const accounts: MerchantAccount[] = [];
      for (const id of ids) {
        try {
          const acc = (await mcFetch(token, `/${id}/accounts/${id}`)) as {
            id: string;
            name?: string;
          };
          accounts.push({ merchantId: id, name: acc.name });
        } catch {
          accounts.push({ merchantId: id });
        }
      }
      return { connected: true as const, accounts };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "NO_GOOGLE_CONNECTION")
        return { connected: false as const, accounts: [] as MerchantAccount[] };
      throw e;
    }
  });

export const listMerchantProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ merchantId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const token = await getValidAccessToken(context.userId);
    const json = (await mcFetch(
      token,
      `/${encodeURIComponent(data.merchantId)}/products?maxResults=50`,
    )) as { resources?: any[] };
    const products: MerchantProduct[] = (json.resources ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      price: p.price,
      imageLink: p.imageLink,
      availability: p.availability,
      link: p.link,
      brand: p.brand,
    }));
    return { products };
  });

const sampleProductSchema = z.object({
  offerId: z.string().min(1).max(255),
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(5000),
  link: z.string().url(),
  imageLink: z.string().url(),
  priceValue: z.string().regex(/^\d+(\.\d{1,2})?$/),
  priceCurrency: z.string().length(3),
  brand: z.string().min(1).max(100),
  availability: z.enum(["in stock", "out of stock", "preorder"]).default("in stock"),
  condition: z.enum(["new", "refurbished", "used"]).default("new"),
});

export const insertMerchantProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ merchantId: z.string().min(1), product: sampleProductSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const token = await getValidAccessToken(context.userId);
    const p = data.product;
    const body = {
      offerId: p.offerId,
      title: p.title,
      description: p.description,
      link: p.link,
      imageLink: p.imageLink,
      contentLanguage: "en",
      targetCountry: "US",
      channel: "online",
      availability: p.availability,
      condition: p.condition,
      brand: p.brand,
      price: { value: p.priceValue, currency: p.priceCurrency },
    };
    return (await mcFetch(token, `/${encodeURIComponent(data.merchantId)}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })) as { id: string; title: string };
  });

export const SAMPLE_PRODUCTS = [
  {
    offerId: "sample-001",
    title: "Classic Cotton T-Shirt",
    description: "Soft 100% cotton crew-neck tee, perfect for everyday wear.",
    link: "https://example.com/products/classic-tee",
    imageLink: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800",
    priceValue: "24.99",
    priceCurrency: "USD",
    brand: "Workspace",
    availability: "in stock" as const,
    condition: "new" as const,
  },
  {
    offerId: "sample-002",
    title: "Wireless Bluetooth Headphones",
    description: "Over-ear noise-cancelling headphones with 30-hour battery life.",
    link: "https://example.com/products/bt-headphones",
    imageLink: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800",
    priceValue: "149.00",
    priceCurrency: "USD",
    brand: "Workspace Audio",
    availability: "in stock" as const,
    condition: "new" as const,
  },
  {
    offerId: "sample-003",
    title: "Stainless Steel Water Bottle",
    description: "Insulated 750ml bottle keeps drinks cold for 24h or hot for 12h.",
    link: "https://example.com/products/water-bottle",
    imageLink: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800",
    priceValue: "29.50",
    priceCurrency: "USD",
    brand: "Workspace Goods",
    availability: "in stock" as const,
    condition: "new" as const,
  },
];
