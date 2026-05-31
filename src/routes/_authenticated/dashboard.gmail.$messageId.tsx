import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Reply, Forward, Paperclip, Download, Loader2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { getGmailMessage, getGmailAttachment } from "@/lib/google.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/dashboard/gmail/$messageId")({
  head: () => ({ meta: [{ title: "Email — Workspace" }] }),
  component: MessageDetail,
});

interface ParsedAddr {
  name: string;
  email: string;
}

function parseAddr(raw: string): ParsedAddr {
  if (!raw) return { name: "", email: "" };
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: raw.trim(), email: raw.trim() };
}

function initials(s: string) {
  const t = s.trim();
  if (!t) return "?";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function MessageDetail() {
  const { messageId } = Route.useParams();
  const navigate = useNavigate();
  const fetchMessage = useServerFn(getGmailMessage);
  const fetchAttachment = useServerFn(getGmailAttachment);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["gmail-message", messageId],
    queryFn: () => fetchMessage({ data: { id: messageId } }),
  });

  const downloadMut = useMutation({
    mutationFn: (att: { attachmentId: string; filename: string; mimeType: string }) =>
      fetchAttachment({
        data: { messageId, attachmentId: att.attachmentId, filename: att.filename, mimeType: att.mimeType },
      }),
    onSuccess: (res) => {
      try {
        const bin = atob(res.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: res.mimeType }));
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        toast.error("Could not download attachment");
      }
    },
    onError: () => toast.error("Download failed"),
  });

  if (isLoading) {
    return (
      <div className="w-full p-4 sm:p-6 lg:p-8 space-y-4">
        <Skeleton className="h-8 w-40" />
        <Card className="p-6 space-y-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-64 w-full" />
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <p className="text-destructive">Failed to load message.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate({ to: "/dashboard/gmail" })}>
          Back to inbox
        </Button>
      </div>
    );
  }

  const fromAddr = parseAddr(data.from);
  const dateStr = data.date ? new Date(data.date).toLocaleString() : "";
  const dateShort = data.date
    ? new Date(data.date).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="w-full p-4 sm:p-6 lg:p-8 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard/gmail">
            <ArrowLeft className="size-4 mr-2" /> Inbox
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/dashboard/gmail/compose" search={{ mode: "reply", messageId }}>
              <Reply className="size-4 mr-2" /> Reply
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/dashboard/gmail/compose" search={{ mode: "forward", messageId }}>
              <Forward className="size-4 mr-2" /> Forward
            </Link>
          </Button>
        </div>
      </div>

      <div className="w-full">
        <h1 className="font-display text-xl sm:text-2xl font-semibold leading-tight">
          {data.subject}
        </h1>

        {/* Gmail-style sender row */}
        <div className="mt-5 flex items-start gap-3">
          <Avatar className="size-10 mt-0.5">
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
              {initials(fromAddr.name || fromAddr.email)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-semibold text-sm text-foreground truncate">
                  {fromAddr.name || fromAddr.email}
                </span>
                {fromAddr.name && (
                  <span className="text-xs text-muted-foreground truncate">
                    &lt;{fromAddr.email}&gt;
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(true)}
                className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                to me
                <ChevronDown className="size-3" />
              </button>
            </div>

            {dateShort && (
              <div
                className="text-xs text-muted-foreground whitespace-nowrap shrink-0"
                title={dateStr}
              >
                {dateShort}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6">
          {data.bodyHtml ? (
            <iframe
              title="email-body"
              sandbox=""
              srcDoc={data.bodyHtml}
              className="w-full min-h-[60vh] bg-white rounded-md border"
            />
          ) : (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm">
              {data.bodyText || "(empty message)"}
            </pre>
          )}
        </div>

        {data.attachments.length > 0 && (
          <div className="mt-6 border-t pt-5">
            <div className="text-sm font-medium mb-3 flex items-center gap-2">
              <Paperclip className="size-4" /> {data.attachments.length} attachment
              {data.attachments.length > 1 ? "s" : ""}
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.attachments.map((a) => (
                <div
                  key={a.attachmentId}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{a.filename}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.mimeType} • {formatBytes(a.size)}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={downloadMut.isPending && downloadMut.variables?.attachmentId === a.attachmentId}
                    onClick={() => downloadMut.mutate(a)}
                  >
                    {downloadMut.isPending && downloadMut.variables?.attachmentId === a.attachmentId ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Message details</DialogTitle>
          </DialogHeader>
          <div className="text-sm space-y-3">
            <DetailRow label="From" value={data.from} />
            {data.to && <DetailRow label="To" value={data.to} />}
            {data.cc && <DetailRow label="Cc" value={data.cc} />}
            {dateStr && <DetailRow label="Date" value={dateStr} />}
            {data.subject && <DetailRow label="Subject" value={data.subject} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-3">
      <div className="text-muted-foreground text-right">{label}:</div>
      <div className="break-words">{value}</div>
    </div>
  );
}

function formatBytes(n: number) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
