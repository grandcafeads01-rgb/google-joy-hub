import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getGmailMessage, sendGmailMessage } from "@/lib/google.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const searchSchema = z.object({
  mode: z.enum(["new", "reply", "forward"]).optional().default("new"),
  messageId: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/dashboard/gmail/compose")({
  head: () => ({ meta: [{ title: "Compose — Workspace" }] }),
  validateSearch: searchSchema,
  component: ComposePage,
});

function ComposePage() {
  const { mode, messageId } = Route.useSearch();
  const navigate = useNavigate();
  const fetchMessage = useServerFn(getGmailMessage);
  const sendFn = useServerFn(sendGmailMessage);

  const sourceQuery = useQuery({
    queryKey: ["gmail-message", messageId],
    queryFn: () => fetchMessage({ data: { id: messageId! } }),
    enabled: !!messageId && (mode === "reply" || mode === "forward"),
  });

  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [threadId, setThreadId] = useState<string | undefined>();
  const [inReplyTo, setInReplyTo] = useState<string | undefined>();
  const [references, setReferences] = useState<string | undefined>();

  useEffect(() => {
    const src = sourceQuery.data;
    if (!src) return;
    const cleanSubject = src.subject.replace(/^(Re:|Fwd:)\s*/i, "");
    if (mode === "reply") {
      setTo(extractEmail(src.from));
      setSubject(`Re: ${cleanSubject}`);
      setThreadId(src.threadId);
      setInReplyTo(src.messageIdHeader);
      setReferences(
        [src.references, src.messageIdHeader].filter(Boolean).join(" ").trim(),
      );
      setBody(
        `<br/><br/><blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex;color:#555">` +
          `<div>On ${src.date}, ${escapeHtml(src.from)} wrote:</div>` +
          (src.bodyHtml || `<pre>${escapeHtml(src.bodyText)}</pre>`) +
          `</blockquote>`,
      );
    } else if (mode === "forward") {
      setSubject(`Fwd: ${cleanSubject}`);
      setBody(
        `<br/><br/>---------- Forwarded message ----------<br/>` +
          `From: ${escapeHtml(src.from)}<br/>` +
          `Date: ${escapeHtml(src.date)}<br/>` +
          `Subject: ${escapeHtml(src.subject)}<br/>` +
          `To: ${escapeHtml(src.to)}<br/><br/>` +
          (src.bodyHtml || `<pre>${escapeHtml(src.bodyText)}</pre>`),
      );
    }
  }, [sourceQuery.data, mode]);

  const sendMut = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          to,
          cc: cc || undefined,
          subject,
          body,
          threadId,
          inReplyTo,
          references,
        },
      }),
    onSuccess: () => {
      toast.success("Email sent");
      navigate({ to: "/dashboard/gmail" });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to send";
      toast.error(msg);
    },
  });

  const title =
    mode === "reply" ? "Reply" : mode === "forward" ? "Forward" : "New message";

  return (
    <div className="w-full p-4 sm:p-6 lg:p-8 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard/gmail">
            <ArrowLeft className="size-4 mr-2" /> Inbox
          </Link>
        </Button>
        <h1 className="font-display text-xl sm:text-2xl font-semibold">{title}</h1>
        <div className="w-20" />
      </div>

      <Card className="p-5 sm:p-7 w-full space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <Input
            id="to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cc">Cc</Label>
          <Input id="cc" value={cc} onChange={(e) => setCc(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="body">Message (HTML supported)</Label>
          <Textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={16}
            className="font-mono text-sm"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" asChild>
            <Link to="/dashboard/gmail">Cancel</Link>
          </Button>
          <Button
            onClick={() => sendMut.mutate()}
            disabled={sendMut.isPending || !to || !subject}
          >
            {sendMut.isPending ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <Send className="size-4 mr-2" />
            )}
            Send
          </Button>
        </div>
      </Card>
    </div>
  );
}

function extractEmail(from: string) {
  const m = from.match(/<(.+)>/);
  return m ? m[1] : from;
}
function escapeHtml(s: string) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
