import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Reply, Forward, Paperclip, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getGmailMessage, getGmailAttachment } from "@/lib/google.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard/gmail/$messageId")({
  head: () => ({ meta: [{ title: "Email — Workspace" }] }),
  component: MessageDetail,
});

function MessageDetail() {
  const { messageId } = Route.useParams();
  const navigate = useNavigate();
  const fetchMessage = useServerFn(getGmailMessage);
  const fetchAttachment = useServerFn(getGmailAttachment);

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
      } catch (e) {
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

  const replyTo = encodeAddr(data.from);

  return (
    <div className="w-full p-4 sm:p-6 lg:p-8 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard/gmail">
            <ArrowLeft className="size-4 mr-2" /> Inbox
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link
              to="/dashboard/gmail/compose"
              search={{ mode: "reply", messageId }}
            >
              <Reply className="size-4 mr-2" /> Reply
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link
              to="/dashboard/gmail/compose"
              search={{ mode: "forward", messageId }}
            >
              <Forward className="size-4 mr-2" /> Forward
            </Link>
          </Button>
        </div>
      </div>

      <Card className="p-5 sm:p-7 w-full">
        <h1 className="font-display text-xl sm:text-2xl font-semibold leading-tight">
          {data.subject}
        </h1>
        <div className="mt-3 text-sm text-muted-foreground space-y-1">
          <div>
            <span className="font-medium text-foreground">From:</span> {data.from}
          </div>
          {data.to && (
            <div>
              <span className="font-medium text-foreground">To:</span> {data.to}
            </div>
          )}
          {data.cc && (
            <div>
              <span className="font-medium text-foreground">Cc:</span> {data.cc}
            </div>
          )}
          {data.date && (
            <div>
              <span className="font-medium text-foreground">Date:</span>{" "}
              {new Date(data.date).toLocaleString()}
            </div>
          )}
        </div>

        <div className="mt-6 border-t pt-6">
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
      </Card>

      {/* hidden, prevents unused warning */}
      <span className="hidden">{replyTo}</span>
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

function encodeAddr(from: string) {
  const m = from.match(/<(.+)>/);
  return m ? m[1] : from;
}
