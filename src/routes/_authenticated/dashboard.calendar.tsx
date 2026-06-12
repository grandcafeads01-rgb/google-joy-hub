import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Pencil,
  MapPin,
  Users,
  Video,
  ExternalLink,
  Link2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  listCalendars,
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  startGoogleOAuth,
  type CalendarEvent,
} from "@/lib/google.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/calendar")({
  head: () => ({ meta: [{ title: "Calendar — Workspace" }] }),
  component: CalendarPage,
});

type FormState = {
  summary: string;
  description: string;
  location: string;
  startDateTime: string;
  endDateTime: string;
  attendees: string;
  addMeet: boolean;
};

const tz =
  typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toLocalInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
function isoToLocalInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return toLocalInput(d);
}
function emptyForm(base?: Date): FormState {
  const now = base ? new Date(base) : new Date();
  if (!base) now.setTime(now.getTime() + 60 * 60 * 1000);
  now.setMinutes(0, 0, 0);
  const end = new Date(now.getTime() + 60 * 60 * 1000);
  return {
    summary: "",
    description: "",
    location: "",
    startDateTime: toLocalInput(now),
    endDateTime: toLocalInput(end),
    attendees: "",
    addMeet: false,
  };
}

function eventColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 70% 45%)`;
}

function CalendarPage() {
  const qc = useQueryClient();
  const fetchCals = useServerFn(listCalendars);
  const fetchEvents = useServerFn(listCalendarEvents);
  const createFn = useServerFn(createCalendarEvent);
  const updateFn = useServerFn(updateCalendarEvent);
  const deleteFn = useServerFn(deleteCalendarEvent);
  const startOAuth = useServerFn(startGoogleOAuth);

  const today = new Date();
  const [calendarId, setCalendarId] = useState("primary");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-11

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  // Visible window: include leading/trailing days shown in the grid
  const { gridStart, gridEnd, monthStart, monthEnd, daysInMonth, leadingBlank } = useMemo(() => {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const daysInMonth = monthEnd.getDate();
    const leadingBlank = monthStart.getDay(); // 0..6
    const gridStart = new Date(year, month, 1 - leadingBlank);
    const totalCells = Math.ceil((leadingBlank + daysInMonth) / 7) * 7;
    const gridEnd = new Date(year, month, 1 - leadingBlank + totalCells);
    return { gridStart, gridEnd, monthStart, monthEnd, daysInMonth, leadingBlank };
  }, [year, month]);

  const cals = useQuery({
    queryKey: ["calendars"],
    queryFn: () => fetchCals(),
  });

  const events = useQuery({
    queryKey: ["calendar-events", calendarId, gridStart.toISOString(), gridEnd.toISOString()],
    queryFn: () =>
      fetchEvents({
        data: {
          calendarId,
          timeMin: gridStart.toISOString(),
          timeMax: gridEnd.toISOString(),
          maxResults: 2500,
        },
      }),
    enabled: cals.data?.connected !== false,
  });

  const invalidateEvents = () =>
    qc.invalidateQueries({ queryKey: ["calendar-events", calendarId] });

  const createMut = useMutation({
    mutationFn: (f: FormState) =>
      createFn({
        data: {
          calendarId,
          summary: f.summary,
          description: f.description || undefined,
          location: f.location || undefined,
          startDateTime: new Date(f.startDateTime).toISOString(),
          endDateTime: new Date(f.endDateTime).toISOString(),
          timeZone: tz,
          attendees: f.attendees
            ? f.attendees.split(",").map((s) => s.trim()).filter(Boolean)
            : undefined,
          addMeet: f.addMeet,
        },
      }),
    onSuccess: () => {
      toast.success("Event created");
      setOpen(false);
      invalidateEvents();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: (f: FormState & { eventId: string }) =>
      updateFn({
        data: {
          eventId: f.eventId,
          calendarId,
          summary: f.summary,
          description: f.description || undefined,
          location: f.location || undefined,
          startDateTime: new Date(f.startDateTime).toISOString(),
          endDateTime: new Date(f.endDateTime).toISOString(),
          timeZone: tz,
          attendees: f.attendees
            ? f.attendees.split(",").map((s) => s.trim()).filter(Boolean)
            : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Event updated");
      setOpen(false);
      setEditing(null);
      invalidateEvents();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (eventId: string) => deleteFn({ data: { calendarId, eventId } }),
    onSuccess: () => {
      toast.success("Event deleted");
      invalidateEvents();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // Bucket events by YYYY-MM-DD (local date)
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events.data?.events ?? []) {
      const iso = ev.start.dateTime ?? ev.start.date;
      if (!iso) continue;
      const d = new Date(iso);
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return map;
  }, [events.data]);

  const totalCells = Math.ceil((leadingBlank + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: totalCells }, (_, i) => {
    const d = new Date(year, month, 1 - leadingBlank + i);
    return d;
  });

  const openCreate = (base?: Date) => {
    setEditing(null);
    setForm(emptyForm(base));
    setOpen(true);
  };

  const openEdit = (ev: CalendarEvent) => {
    setEditing(ev);
    setForm({
      summary: ev.summary ?? "",
      description: ev.description ?? "",
      location: ev.location ?? "",
      startDateTime: isoToLocalInput(ev.start.dateTime ?? ev.start.date),
      endDateTime: isoToLocalInput(ev.end.dateTime ?? ev.end.date),
      attendees: (ev.attendees ?? []).map((a) => a.email).join(", "),
      addMeet: false,
    });
    setOpen(true);
  };

  const submit = () => {
    if (!form.summary.trim()) return toast.error("Title is required");
    if (editing) updateMut.mutate({ ...form, eventId: editing.id });
    else createMut.mutate(form);
  };

  const goPrev = () => {
    const m = month - 1;
    if (m < 0) {
      setMonth(11);
      setYear(year - 1);
    } else setMonth(m);
  };
  const goNext = () => {
    const m = month + 1;
    if (m > 11) {
      setMonth(0);
      setYear(year + 1);
    } else setMonth(m);
  };
  const goToday = () => {
    setMonth(today.getMonth());
    setYear(today.getFullYear());
  };

  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = today.getFullYear() - 5; y <= today.getFullYear() + 5; y++) arr.push(y);
    return arr;
  }, [today]);

  if (cals.data && cals.data.connected === false) {
    return (
      <div className="p-6 lg:p-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <CalendarIcon className="size-5" /> Connect Google to use Calendar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              onClick={async () => {
                const res = await startOAuth({ data: { origin: window.location.origin } });
                window.location.href = res.url;
              }}
            >
              <Link2 className="size-4 mr-2" /> Connect Google
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground mt-1">
            Browse and manage your Google Calendar events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={calendarId} onValueChange={setCalendarId}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Select calendar" />
            </SelectTrigger>
            <SelectContent>
              {(cals.data?.calendars ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.summary}
                  {c.primary ? " (primary)" : ""}
                </SelectItem>
              ))}
              {!cals.data && <SelectItem value="primary">Primary</SelectItem>}
            </SelectContent>
          </Select>
          <Button onClick={() => openCreate()}>
            <Plus className="size-4 mr-2" /> New event
          </Button>
        </div>
      </div>

      {/* Month/Year selector */}
      <Card>
        <CardContent className="p-3 md:p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={goPrev}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={goNext}>
                <ChevronRight className="size-4" />
              </Button>
              <Button variant="ghost" onClick={goToday}>
                Today
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="font-display text-xl font-semibold">
              {MONTHS[month]} {year}
            </div>
          </div>

          {/* Weekday header */}
          <div className="mt-4 grid grid-cols-7 border-b">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Month grid */}
          {events.isLoading ? (
            <div className="grid grid-cols-7 gap-px bg-border mt-px">
              {Array.from({ length: totalCells }).map((_, i) => (
                <Skeleton key={i} className="h-28 md:h-32 rounded-none" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-px bg-border mt-px">
              {cells.map((d, i) => {
                const inMonth = d.getMonth() === month;
                const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                const dayEvents = eventsByDay.get(key) ?? [];
                const isToday = key === todayKey;
                return (
                  <div
                    key={i}
                    className={cn(
                      "bg-background min-h-28 md:min-h-32 p-1.5 flex flex-col gap-1 group cursor-pointer transition-colors hover:bg-muted/40",
                      !inMonth && "bg-muted/20 text-muted-foreground",
                    )}
                    onClick={() => {
                      const base = new Date(d);
                      base.setHours(9, 0, 0, 0);
                      openCreate(base);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "inline-flex items-center justify-center text-xs font-medium h-6 min-w-6 px-1.5 rounded-full",
                          isToday && "bg-primary text-primary-foreground",
                        )}
                      >
                        {d.getDate()}
                      </span>
                      {dayEvents.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{dayEvents.length - 3}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5 overflow-hidden">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <button
                          key={ev.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(ev);
                          }}
                          className="text-left text-[11px] truncate rounded px-1.5 py-0.5 text-white hover:opacity-90"
                          style={{ backgroundColor: eventColor(ev.id) }}
                          title={ev.summary || "(no title)"}
                        >
                          {ev.start.dateTime && (
                            <span className="opacity-80 mr-1">
                              {new Date(ev.start.dateTime).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                          {ev.summary || "(no title)"}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {events.error && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">
            {events.error instanceof Error ? events.error.message : "Failed to load"}
            <div className="mt-2 text-muted-foreground">
              If this mentions an OAuth scope, disconnect & reconnect Google in Settings to grant Calendar access.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit event" : "Create event"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                placeholder="Team sync"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start</Label>
                <Input
                  type="datetime-local"
                  value={form.startDateTime}
                  onChange={(e) => setForm({ ...form, startDateTime: e.target.value })}
                />
              </div>
              <div>
                <Label>End</Label>
                <Input
                  type="datetime-local"
                  value={form.endDateTime}
                  onChange={(e) => setForm({ ...form, endDateTime: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Location</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div>
              <Label>Attendees (comma-separated emails)</Label>
              <Input
                value={form.attendees}
                onChange={(e) => setForm({ ...form, attendees: e.target.value })}
                placeholder="a@x.com, b@y.com"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            {!editing && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="flex items-center gap-2 text-sm">
                  <Video className="size-4" /> Add Google Meet link
                </div>
                <Switch
                  checked={form.addMeet}
                  onCheckedChange={(v) => setForm({ ...form, addMeet: v })}
                />
              </div>
            )}
            {editing && (
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground border-t pt-3">
                {editing.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" /> {editing.location}
                  </span>
                )}
                {editing.attendees && editing.attendees.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Users className="size-3" /> {editing.attendees.length}
                  </span>
                )}
                {editing.hangoutLink && (
                  <a
                    href={editing.hangoutLink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    <Video className="size-3" /> Meet
                  </a>
                )}
                {editing.htmlLink && (
                  <a
                    href={editing.htmlLink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    <ExternalLink className="size-3" /> Open in Google
                  </a>
                )}
                {editing.status && (
                  <Badge variant="outline" className="text-[10px] py-0">
                    {editing.status}
                  </Badge>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <div>
              {editing && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (confirm("Delete this event?")) {
                      deleteMut.mutate(editing.id);
                      setOpen(false);
                    }
                  }}
                >
                  <Trash2 className="size-4 mr-1 text-destructive" /> Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={submit}
                disabled={createMut.isPending || updateMut.isPending}
              >
                {editing ? (
                  <>
                    <Pencil className="size-4 mr-1" /> Save
                  </>
                ) : (
                  <>
                    <Plus className="size-4 mr-1" /> Create
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
