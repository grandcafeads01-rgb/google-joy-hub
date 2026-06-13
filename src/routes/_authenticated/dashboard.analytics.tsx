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
              { key: "activeUsers", label: "Active users", icon: Users, val: overview.data?.totals.activeUsers, fmt: fmtNumber, color: METRIC_COLORS.activeUsers },
              { key: "newUsers", label: "New users", icon: UserPlus, val: overview.data?.totals.newUsers, fmt: fmtNumber, color: METRIC_COLORS.newUsers },
              { key: "sessions", label: "Sessions", icon: Activity, val: overview.data?.totals.sessions, fmt: fmtNumber, color: METRIC_COLORS.sessions },
              { key: "pageViews", label: "Page views", icon: Eye, val: overview.data?.totals.pageViews, fmt: fmtNumber, color: METRIC_COLORS.pageViews },
              { key: "avgSessionDuration", label: "Avg session", icon: Clock, val: overview.data?.totals.avgSessionDuration, fmt: fmtDuration, color: METRIC_COLORS.avgSessionDuration },
              { key: "bounceRate", label: "Bounce rate", icon: TrendingDown, val: overview.data?.totals.bounceRate, fmt: fmtPct, color: METRIC_COLORS.bounceRate },
            ].map((m) => (
              <Card
                key={m.label}
                className="overflow-hidden border-l-4"
                style={{ borderLeftColor: m.color }}
              >
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <m.icon className="size-3.5" style={{ color: m.color }} />
                    {m.label}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {overview.isLoading || m.val === undefined ? (
                    <Skeleton className="h-7 w-20" />
                  ) : (
                    <div className="text-2xl font-bold tabular-nums" style={{ color: m.color }}>
                      {m.fmt(m.val)}
                    </div>
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
                <Skeleton className="h-72 w-full" />
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={(overview.data?.byDay ?? []).map((d) => ({
                        date: fmtDate(d.date),
                        users: d.users,
                        sessions: d.sessions,
                      }))}
                      margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="gUsers" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={METRIC_COLORS.activeUsers} stopOpacity={0.7} />
                          <stop offset="100%" stopColor={METRIC_COLORS.activeUsers} stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="gSessions" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={METRIC_COLORS.sessions} stopOpacity={0.7} />
                          <stop offset="100%" stopColor={METRIC_COLORS.sessions} stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                        }}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="users"
                        name="Active users"
                        stroke={METRIC_COLORS.activeUsers}
                        strokeWidth={2}
                        fill="url(#gUsers)"
                      />
                      <Area
                        type="monotone"
                        dataKey="sessions"
                        name="Sessions"
                        stroke={METRIC_COLORS.sessions}
                        strokeWidth={2}
                        fill="url(#gSessions)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top sources</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={(overview.data?.topSources ?? []).slice(0, 8)}
                      layout="vertical"
                      margin={{ left: 20, right: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" fontSize={11} />
                      <YAxis type="category" dataKey="source" fontSize={11} width={90} />
                      <Tooltip />
                      <Bar dataKey="sessions" radius={[0, 6, 6, 0]}>
                        {(overview.data?.topSources ?? []).slice(0, 8).map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top countries</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={(overview.data?.byCountry ?? []).slice(0, 6)}
                        dataKey="users"
                        nameKey="country"
                        innerRadius={45}
                        outerRadius={80}
                        paddingAngle={2}
                      >
                        {(overview.data?.byCountry ?? []).slice(0, 6).map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top pages</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(overview.data?.topPages ?? []).map((p, i) => {
                const max = overview.data?.topPages[0]?.views || 1;
                const pct = (p.views / max) * 100;
                const color = CHART_COLORS[i % CHART_COLORS.length];
                return (
                  <div key={p.path} className="space-y-1">
                    <div className="flex items-center justify-between text-sm gap-2">
                      <span className="truncate">{p.path}</span>
                      <span className="tabular-nums font-medium" style={{ color }}>
                        {fmtNumber(p.views)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                  </div>
                );
              })}
              {overview.data && overview.data.topPages.length === 0 && (
                <p className="text-sm text-muted-foreground">No data</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
