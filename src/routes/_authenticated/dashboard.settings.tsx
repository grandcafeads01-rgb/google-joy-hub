import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { toast } from "sonner";
import { CheckCircle2, Link2, LogOut, Mail, HardDrive, Sparkles } from "lucide-react";
import {
  getGoogleConnection,
  startGoogleOAuth,
  disconnectGoogle,
} from "@/lib/google.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SettingsSearch {
  google_connected?: string;
  google_error?: string;
}

export const Route = createFileRoute("/_authenticated/dashboard/settings")({
  head: () => ({ meta: [{ title: "Settings — Workspace" }] }),
  validateSearch: (s: Record<string, unknown>): SettingsSearch => ({
    google_connected: typeof s.google_connected === "string" ? s.google_connected : undefined,
    google_error: typeof s.google_error === "string" ? s.google_error : undefined,
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const search = useSearch({ from: "/_authenticated/dashboard/settings" });
  const qc = useQueryClient();
  const fetchConn = useServerFn(getGoogleConnection);
  const startOAuth = useServerFn(startGoogleOAuth);
  const disconnect = useServerFn(disconnectGoogle);

  const conn = useQuery({ queryKey: ["google-conn"], queryFn: () => fetchConn() });

  useEffect(() => {
    if (search.google_connected) {
      toast.success("Google Workspace connected");
      qc.invalidateQueries();
    }
    if (search.google_error) {
      toast.error(`Google connection failed: ${search.google_error}`);
    }
  }, [search.google_connected, search.google_error, qc]);

  const connectMutation = useMutation({
    mutationFn: () => startOAuth({ data: { origin: window.location.origin } }),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to start OAuth"),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnect(),
    onSuccess: () => {
      toast.success("Disconnected");
      qc.invalidateQueries();
    },
  });

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your Google Workspace connection.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-4">
            <div className="size-12 rounded-xl bg-gradient-to-br from-[color:var(--color-gmail)] to-[color:var(--color-drive)] grid place-items-center text-white">
              <Sparkles className="size-6" />
            </div>
            <div className="flex-1">
              <CardTitle className="font-display">Google Workspace</CardTitle>
              <CardDescription>
                Grant access to Gmail and Drive so they appear in this dashboard.
              </CardDescription>
            </div>
            {conn.data && (
              <Badge variant="outline" className="border-success text-success">
                <CheckCircle2 className="size-3 mr-1" /> Connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {conn.data ? (
            <>
              <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
                <Row label="Account" value={conn.data.email ?? "—"} />
                <Row
                  label="Connected"
                  value={new Date(conn.data.connected_at).toLocaleString()}
                />
                <Row
                  label="Scopes"
                  value={
                    <div className="flex flex-wrap gap-1 justify-end">
                      <ScopeBadge icon={<Mail className="size-3" />} label="Gmail" />
                      <ScopeBadge icon={<HardDrive className="size-3" />} label="Drive" />
                    </div>
                  }
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => connectMutation.mutate()}
                  disabled={connectMutation.isPending}
                >
                  <Link2 className="size-4 mr-2" /> Reconnect
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  <LogOut className="size-4 mr-2" /> Disconnect
                </Button>
              </div>
            </>
          ) : (
            <>
              <ul className="text-sm space-y-2 text-muted-foreground">
                <li className="flex gap-2">
                  <Mail className="size-4 mt-0.5 text-[color:var(--color-gmail)]" /> Read your Gmail inbox and receive live notifications
                </li>
                <li className="flex gap-2">
                  <HardDrive className="size-4 mt-0.5 text-[color:var(--color-drive)]" /> Browse, create folders, upload & download files in Drive
                </li>
              </ul>
              <Button
                size="lg"
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
                className="w-full sm:w-auto"
              >
                <Link2 className="size-4 mr-2" />
                {connectMutation.isPending ? "Redirecting…" : "Connect Google Workspace"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
function ScopeBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Badge variant="secondary" className="gap-1">
      {icon}
      {label}
    </Badge>
  );
}
