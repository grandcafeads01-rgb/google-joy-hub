import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGoogleConnection } from "@/lib/google.functions";
import { listGmailMessages } from "@/lib/google.functions";
import { listDriveFiles } from "@/lib/google.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, HardDrive, Sparkles, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  component: DashboardHome,
});

function DashboardHome() {
  const fetchConn = useServerFn(getGoogleConnection);
  const fetchGmail = useServerFn(listGmailMessages);
  const fetchDrive = useServerFn(listDriveFiles);

  const conn = useQuery({ queryKey: ["google-conn"], queryFn: () => fetchConn() });
  const gmail = useQuery({
    queryKey: ["gmail-summary"],
    queryFn: () => fetchGmail(),
    enabled: !!conn.data,
  });
  const drive = useQuery({
    queryKey: ["drive-summary"],
    queryFn: () => fetchDrive({ data: {} }),
    enabled: !!conn.data,
  });

  const unread = gmail.data?.connected ? gmail.data.messages.filter((m) => m.unread).length : 0;
  const fileCount = drive.data?.connected ? drive.data.files.length : 0;

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-6xl">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-1">Your Google Workspace at a glance.</p>
      </div>

      {!conn.data && (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-accent/30">
          <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-6">
            <div className="size-12 rounded-xl bg-primary text-primary-foreground grid place-items-center">
              <Link2 className="size-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Connect Google Workspace</h3>
              <p className="text-sm text-muted-foreground">
                Link your Google account to see Gmail and Drive in this dashboard.
              </p>
            </div>
            <Button asChild>
              <Link to="/dashboard/settings">Connect</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Stat
          label="Unread emails"
          value={conn.data ? String(unread) : "—"}
          icon={<Mail className="size-5" />}
          accent="bg-[color:var(--color-gmail)]/10 text-[color:var(--color-gmail)]"
          to="/dashboard/gmail"
        />
        <Stat
          label="Files in My Drive"
          value={conn.data ? String(fileCount) : "—"}
          icon={<HardDrive className="size-5" />}
          accent="bg-[color:var(--color-drive)]/10 text-[color:var(--color-drive)]"
          to="/dashboard/drive"
        />
        <Stat
          label="Connection"
          value={conn.data ? "Connected" : "Not connected"}
          icon={<Sparkles className="size-5" />}
          accent="bg-primary/10 text-primary"
          to="/dashboard/settings"
        />
      </div>

      {conn.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-display">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {gmail.data?.connected && gmail.data.messages.slice(0, 3).map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                <Mail className="size-4 text-[color:var(--color-gmail)] shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{m.subject}</div>
                  <div className="text-muted-foreground text-xs truncate">{m.from}</div>
                </div>
              </div>
            ))}
            {drive.data?.connected && drive.data.files.slice(0, 3).map((f) => (
              <div key={f.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                <HardDrive className="size-4 text-[color:var(--color-drive)] shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{f.name}</div>
                  <div className="text-muted-foreground text-xs truncate">{f.mimeType}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  accent,
  to,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
  to: string;
}) {
  return (
    <Link to={to} className="block group">
      <Card className="transition-all group-hover:shadow-md group-hover:-translate-y-0.5">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{label}</span>
            <div className={`size-9 rounded-lg grid place-items-center ${accent}`}>{icon}</div>
          </div>
          <div className="mt-3 text-3xl font-display font-bold">{value}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
