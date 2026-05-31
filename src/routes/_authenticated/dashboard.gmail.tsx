import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Mail, Inbox, RefreshCw, Link2, PenSquare } from "lucide-react";
import { listGmailMessages } from "@/lib/google.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard/gmail")({
  head: () => ({ meta: [{ title: "Gmail — Workspace" }] }),
  component: GmailLayout,
});

function GmailLayout() {
  const matchRoute = useMatchRoute();
  // When viewing a child route (message detail or compose), render just it.
  const onChild =
    matchRoute({ to: "/dashboard/gmail/$messageId" as never, fuzzy: true }) ||
    matchRoute({ to: "/dashboard/gmail/compose" as never, fuzzy: true });

  if (onChild) return <Outlet />;
  return <GmailInbox />;
}

function GmailInbox() {
  const fetchGmail = useServerFn(listGmailMessages);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["gmail-summary"],
    queryFn: () => fetchGmail(),
    refetchInterval: 30_000,
  });

  const seenIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!data?.connected) return;
    const currentIds = new Set(data.messages.map((m) => m.id));
    if (seenIds.current === null) {
      seenIds.current = currentIds;
      return;
    }
    const newUnread = data.messages.filter(
      (m) => m.unread && !seenIds.current!.has(m.id),
    );
    newUnread.forEach((m) => {
      toast(`New email: ${m.subject}`, { description: m.from, icon: <Mail className="size-4" /> });
    });
    seenIds.current = currentIds;
  }, [data]);

  if (!isLoading && data && !data.connected) {
    return (
      <div className="p-8 max-w-2xl">
        <EmptyConnect />
      </div>
    );
  }

  return (
    <div className="w-full p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
            <Mail className="size-7 text-[color:var(--color-gmail)]" /> Inbox
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Auto-refreshes every 30s • Live notifications enabled
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`size-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button asChild size="sm">
            <Link to="/dashboard/gmail/compose">
              <PenSquare className="size-4 mr-2" /> Compose
            </Link>
          </Button>
        </div>
      </div>

      <Card className="w-full overflow-hidden">
        {isLoading && <ListSkeleton />}
        {data?.connected && data.messages.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            <Inbox className="size-10 mx-auto mb-2 opacity-50" />
            Inbox is empty.
          </div>
        )}
        {data?.connected &&
          data.messages.map((m) => (
            <Link
              key={m.id}
              to="/dashboard/gmail/$messageId"
              params={{ messageId: m.id }}
              className={`flex items-start gap-4 p-4 border-b last:border-0 hover:bg-accent/40 transition-colors ${
                m.unread ? "bg-primary/[0.03]" : ""
              }`}
            >
              <div
                className={`size-2 rounded-full mt-2 shrink-0 ${
                  m.unread ? "bg-[color:var(--color-gmail)]" : "bg-transparent"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className={`truncate ${m.unread ? "font-semibold" : ""}`}>
                    {extractName(m.from)}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {formatDate(m.date)}
                  </div>
                </div>
                <div className={`truncate ${m.unread ? "font-medium" : ""}`}>{m.subject}</div>
                <div className="text-sm text-muted-foreground truncate mt-0.5">
                  {m.snippet}
                </div>
              </div>
            </Link>
          ))}
      </Card>
    </div>
  );
}

function EmptyConnect() {
  return (
    <Card className="p-8 text-center space-y-4">
      <div className="size-14 rounded-2xl bg-[color:var(--color-gmail)]/10 text-[color:var(--color-gmail)] grid place-items-center mx-auto">
        <Mail className="size-7" />
      </div>
      <div>
        <h2 className="font-display text-xl font-semibold">Connect Gmail</h2>
        <p className="text-muted-foreground mt-1">
          Link your Google account in Settings to start seeing your inbox.
        </p>
      </div>
      <Button asChild>
        <Link to="/dashboard/settings">
          <Link2 className="size-4 mr-2" /> Open Settings
        </Link>
      </Button>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-3 items-center">
          <Skeleton className="size-2 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function extractName(from: string) {
  const match = from.match(/^"?([^"<]+?)"?\s*<.+>$/);
  return match ? match[1].trim() : from;
}
function formatDate(d: string) {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}
