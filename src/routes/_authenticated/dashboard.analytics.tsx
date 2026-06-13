import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAnalyticsAccounts,
  getAnalyticsOverview,
  getGoogleConnection,
} from "@/lib/google.functions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3,
  Users,
  UserPlus,
  Activity,
  Eye,
  Clock,
  TrendingDown,
  RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const CHART_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981",
  "#06b6d4", "#8b5cf6", "#ef4444", "#84cc16",
  "#f97316", "#14b8a6",
];
const METRIC_COLORS = {
  activeUsers: "#6366f1",
  newUsers: "#10b981",
  sessions: "#ec4899",
  pageViews: "#f59e0b",
  avgSessionDuration: "#06b6d4",
  bounceRate: "#ef4444",
} as const;

export const Route = createFileRoute("/_authenticated/dashboard/analytics")({
  component: AnalyticsPage,
});

function fmtNumber(n: number) {
  return new Intl.NumberFormat().format(Math.round(n));
}
function fmtDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}m ${s}s`;
}
function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
function fmtDate(d: string) {
  if (d.length !== 8) return d;
  return `${d.slice(4, 6)}/${d.slice(6, 8)}`;
}

function AnalyticsPage() {
  const fetchConn = useServerFn(getGoogleConnection);
  const fetchAccounts = useServerFn(listAnalyticsAccounts);
  const fetchOverview = useServerFn(getAnalyticsOverview);

  const conn = useQuery({ queryKey: ["google-conn"], queryFn: () => fetchConn() });
  const accounts = useQuery({
    queryKey: ["ga-accounts"],
    queryFn: () => fetchAccounts(),
    enabled: !!conn.data,
    retry: false,
  });

  const allProperties = useMemo(
    () => (accounts.data?.accounts ?? []).flatMap((a) => a.properties.map((p) => ({ ...p, accountName: a.displayName }))),
    [accounts.data],
  );

  const [propertyId, setPropertyId] = useState<string>("");
  const [days, setDays] = useState<number>(28);

  const activeProperty = propertyId || allProperties[0]?.name || "";

  const overview = useQuery({
    queryKey: ["ga-overview", activeProperty, days],
    queryFn: () => fetchOverview({ data: { propertyId: activeProperty, days } }),
    enabled: !!activeProperty,
  });

  if (!conn.data) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Connect Google</CardTitle>
            <CardDescription>
              Connect your Google account in Settings to access Analytics.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <BarChart3 className="size-6" /> Google Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            View property data overview from your GA4 properties.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={activeProperty}
            onValueChange={setPropertyId}
            disabled={!allProperties.length}
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select property" />
            </SelectTrigger>
            <SelectContent>
              {allProperties.map((p) => (
                <SelectItem key={p.name} value={p.name}>
                  {p.displayName}{" "}
                  <span className="text-muted-foreground">
                    · {p.accountName}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7d</SelectItem>
              <SelectItem value="28">Last 28d</SelectItem>
              <SelectItem value="90">Last 90d</SelectItem>
              <SelectItem value="365">Last 365d</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => overview.refetch()}
            disabled={overview.isFetching}
          >
            <RefreshCw className={`size-4 ${overview.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Accounts & properties list */}
      <Card>
        <CardHeader>
          <CardTitle>Your Analytics accounts</CardTitle>
          <CardDescription>
            {accounts.isLoading
              ? "Loading…"
              : `${accounts.data?.accounts.length ?? 0} account(s), ${allProperties.length} property(ies)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {accounts.error && (
            <p className="text-sm text-destructive">
              {(accounts.error as Error).message.includes("403")
                ? "Reconnect Google in Settings to grant Analytics access."
                : (accounts.error as Error).message}
            </p>
          )}
          {(accounts.data?.accounts ?? []).map((a) => (
            <div key={a.name} className="border rounded-md p-3">
              <div className="font-medium">{a.displayName}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {a.properties.length === 0 && (
                  <span className="text-xs text-muted-foreground">No properties</span>
                )}
                {a.properties.map((p) => (
                  <Badge
                    key={p.name}
                    variant={activeProperty === p.name ? "default" : "secondary"}
                    className="cursor-pointer"
                    onClick={() => setPropertyId(p.name)}
                  >
                    {p.displayName}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Overview metrics */}
      {activeProperty && (
        <>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Active users", icon: Users, val: overview.data?.totals.activeUsers, fmt: fmtNumber },
              { label: "New users", icon: UserPlus, val: overview.data?.totals.newUsers, fmt: fmtNumber },
              { label: "Sessions", icon: Activity, val: overview.data?.totals.sessions, fmt: fmtNumber },
              { label: "Page views", icon: Eye, val: overview.data?.totals.pageViews, fmt: fmtNumber },
              { label: "Avg session", icon: Clock, val: overview.data?.totals.avgSessionDuration, fmt: fmtDuration },
              { label: "Bounce rate", icon: TrendingDown, val: overview.data?.totals.bounceRate, fmt: fmtPct },
            ].map((m) => (
              <Card key={m.label}>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <m.icon className="size-3.5" />
                    {m.label}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {overview.isLoading || m.val === undefined ? (
                    <Skeleton className="h-7 w-20" />
                  ) : (
                    <div className="text-2xl font-bold tabular-nums">{m.fmt(m.val)}</div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Users & sessions over time</CardTitle>
            </CardHeader>
            <CardContent>
              {overview.isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={(overview.data?.byDay ?? []).map((d) => ({
                        date: fmtDate(d.date),
                        users: d.users,
                        sessions: d.sessions,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="date" fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      <Area type="monotone" dataKey="users" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
                      <Area type="monotone" dataKey="sessions" stroke="hsl(var(--accent))" fill="hsl(var(--accent) / 0.2)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top pages</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(overview.data?.topPages ?? []).map((p) => (
                  <div key={p.path} className="flex items-center justify-between text-sm gap-2">
                    <span className="truncate">{p.path}</span>
                    <span className="tabular-nums font-medium">{fmtNumber(p.views)}</span>
                  </div>
                ))}
                {overview.data && overview.data.topPages.length === 0 && (
                  <p className="text-sm text-muted-foreground">No data</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top sources</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(overview.data?.topSources ?? []).map((p) => (
                  <div key={p.source} className="flex items-center justify-between text-sm gap-2">
                    <span className="truncate">{p.source}</span>
                    <span className="tabular-nums font-medium">{fmtNumber(p.sessions)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top countries</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(overview.data?.byCountry ?? []).map((p) => (
                  <div key={p.country} className="flex items-center justify-between text-sm gap-2">
                    <span className="truncate">{p.country}</span>
                    <span className="tabular-nums font-medium">{fmtNumber(p.users)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
