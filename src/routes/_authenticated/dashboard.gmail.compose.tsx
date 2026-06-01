import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  Minus,
  Maximize2,
  Minimize2,
  X,
  Send,
  Loader2,
  Paperclip,
  Link as LinkIcon,
  Smile,
  Image as ImageIcon,
  Lock,
  Pencil,
  MoreVertical,
  Trash2,
  ChevronDown,
  Type,
} from "lucide-react";
import { toast } from "sonner";
import { getGmailMessage, sendGmailMessage } from "@/lib/google.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  mode: z.enum(["new", "reply", "forward"]).optional().default("new"),
  messageId: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/dashboard/gmail/compose")({
  head: () => ({ meta: [{ title: "Compose — Workspace" }] }),
  validateSearch: searchSchema,
  component: ComposeModal,
});

function ComposeModal() {
  const { mode, messageId } = Route.useSearch();
  const navigate = useNavigate();
  const fetchMessage = useServerFn(getGmailMessage);
  const sendFn = useServerFn(sendGmailMessage);

  const [minimized, setMinimized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const sourceQuery = useQuery({
    queryKey: ["gmail-message", messageId],
    queryFn: () => fetchMessage({ data: { id: messageId! } }),
    enabled: !!messageId && (mode === "reply" || mode === "forward"),
  });

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [threadId, setThreadId] = useState<string | undefined>();
  const [inReplyTo, setInReplyTo] = useState<string | undefined>();
  const [references, setReferences] = useState<string | undefined>();
  const bodyRef = useRef<HTMLDivElement | null>(null);

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

  // Sync initial body into contentEditable
  useEffect(() => {
    if (bodyRef.current && body && bodyRef.current.innerHTML === "") {
      bodyRef.current.innerHTML = body;
    }
  }, [body]);

  const close = () => navigate({ to: "/dashboard/gmail", search: { folder: "inbox" } });

  const sendMut = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          to,
          subject,
          body,
          threadId,
          inReplyTo,
          references,
        },
      }),
    onSuccess: () => {
      toast.success("Email sent");
      close();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to send";
      toast.error(msg);
    },
  });

  const title =
    mode === "reply" ? "Reply" : mode === "forward" ? "Forward" : "New Message";

  // Backdrop only on fullscreen
  return (
    <div
      className={cn(
        "fixed z-50 pointer-events-none",
        fullscreen
          ? "inset-0 bg-black/40 grid place-items-center p-4 pointer-events-auto"
          : "bottom-0 right-4 sm:right-8",
      )}
    >
      <div
        className={cn(
          "pointer-events-auto bg-background border border-border shadow-2xl flex flex-col overflow-hidden",
          fullscreen
            ? "w-full max-w-4xl h-[85vh] rounded-lg"
            : minimized
              ? "w-[320px] rounded-t-lg"
              : "w-[95vw] sm:w-[560px] h-[560px] rounded-t-lg",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#f2f6fc] dark:bg-muted text-foreground">
          <div className="font-medium text-sm truncate">{title}</div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <button
              type="button"
              onClick={() => setMinimized((m) => !m)}
              className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded"
              aria-label="Minimize"
            >
              <Minus className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setFullscreen((f) => !f);
                setMinimized(false);
              }}
              className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded"
              aria-label="Toggle fullscreen"
            >
              {fullscreen ? (
                <Minimize2 className="size-4" />
              ) : (
                <Maximize2 className="size-4" />
              )}
            </button>
            <button
              type="button"
              onClick={close}
              className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {!minimized && (
          <>
            {/* Recipients */}
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="Recipients"
              className="px-4 py-2.5 text-sm border-b border-border bg-transparent outline-none placeholder:text-muted-foreground"
            />
            {/* Subject */}
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="px-4 py-2.5 text-sm border-b border-border bg-transparent outline-none placeholder:text-muted-foreground"
            />

            {/* Body */}
            <div
              ref={bodyRef}
              contentEditable
              onInput={(e) => setBody((e.target as HTMLDivElement).innerHTML)}
              className="flex-1 px-4 py-3 text-sm outline-none overflow-auto"
              suppressContentEditableWarning
            />

            {/* Footer toolbar */}
            <div className="flex items-center justify-between px-2 py-2 border-t border-border">
              <div className="flex items-center gap-1">
                <div className="flex rounded-full overflow-hidden">
                  <Button
                    onClick={() => sendMut.mutate()}
                    disabled={sendMut.isPending || !to || !subject}
                    className="rounded-full rounded-r-none px-5 h-9 bg-[#0b57d0] hover:bg-[#0a4cb8] text-white"
                  >
                    {sendMut.isPending ? (
                      <Loader2 className="size-4 mr-1 animate-spin" />
                    ) : null}
                    Send
                  </Button>
                  <Button
                    variant="default"
                    className="rounded-full rounded-l-none h-9 px-2 bg-[#0b57d0] hover:bg-[#0a4cb8] text-white border-l border-white/20"
                    aria-label="Send options"
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                </div>

                <ToolIcon icon={Type} label="Formatting options" />
                <ToolIcon icon={Paperclip} label="Attach files" />
                <ToolIcon icon={LinkIcon} label="Insert link" />
                <ToolIcon icon={Smile} label="Insert emoji" />
                <ToolIcon icon={ImageIcon} label="Insert from Drive" />
                <ToolIcon icon={ImageIcon} label="Insert photo" />
                <ToolIcon icon={Lock} label="Confidential mode" />
                <ToolIcon icon={Pencil} label="Insert signature" />
                <ToolIcon icon={MoreVertical} label="More options" />
              </div>
              <ToolIcon icon={Trash2} label="Discard" onClick={close} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ToolIcon({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="p-2 rounded-full hover:bg-accent text-muted-foreground transition-colors"
    >
      <Icon className="size-4" />
    </button>
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
