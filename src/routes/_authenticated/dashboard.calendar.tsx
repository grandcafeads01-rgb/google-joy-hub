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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

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

function toLocalInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function emptyForm(): FormState {
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    summary: "",
    description: "",
    location: "",
    startDateTime: toLocalInput(start.toISOString()),
    endDateTime: toLocalInput(end.toISOString()),
    attendees: "",
    addMeet: false,
  };
}

function CalendarPage() {
  const qc = useQueryClient();
  const fetchCals = useServerFn(listCalendars);
  const fetchEvents = useServerFn(listCalendarEvents);
  const createFn = useServerFn(createCalendarEvent);
  const updateFn = useServerFn(updateCalendarEvent);
  const deleteFn = useServerFn(deleteCalendarEvent);
  const startOAuth = useServerFn(startGoogleOAuth);

  const [calendarId, setCalendarId] = useState("primary");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const cals = useQuery({
    queryKey: ["calendars"],
    queryFn: () => fetchCals(),
  });

  const events = useQuery({
    queryKey: ["calendar-events", calendarId],
    queryFn: () => fetchEvents({ data: { calendarId } }),
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

  const grouped = useMemo(() => {
    const list = events.data?.events ?? [];
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of list) {
      const iso = ev.start.dateTime ?? ev.start.date ?? "";
      const day = iso.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(ev);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [events.data]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (ev: CalendarEvent) => {
    setEditing(ev);
    setForm({
      summary: ev.summary ?? "",
      description: ev.description ?? "",
      location: ev.location ?? "",
      startDateTime: toLocalInput(ev.start.dateTime ?? ev.start.date),
      endDateTime: toLocalInput(ev.end.dateTime ?? ev.end.date),
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

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground mt-1">
            Upcoming events from your Google Calendar.
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
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>
                <Plus className="size-4 mr-2" /> New event
              </Button>
            </DialogTrigger>
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
                      onChange={(e) =>
                        setForm({ ...form, startDateTime: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>End</Label>
                    <Input
                      type="datetime-local"
                      value={form.endDateTime}
                      onChange={(e) =>
                        setForm({ ...form, endDateTime: e.target.value })
                      }
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
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
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
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={submit}
                  disabled={createMut.isPending || updateMut.isPending}
                >
                  {editing ? "Save changes" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {events.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

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

      {!events.isLoading && grouped.length === 0 && !events.error && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No upcoming events.
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {grouped.map(([day, items]) => (
          <div key={day}>
            <div className="text-sm font-semibold text-muted-foreground mb-2">
              {new Date(day).toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </div>
            <div className="space-y-2">
              {items.map((ev) => (
                <Card key={ev.id} className="hover:bg-muted/40 transition-colors">
                  <CardContent className="p-4 flex items-start gap-4">
                    <div className="text-sm font-medium w-24 shrink-0 text-muted-foreground">
                      {ev.start.dateTime
                        ? new Date(ev.start.dateTime).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "All day"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{ev.summary || "(no title)"}</div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-3 mt-1">
                        {ev.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3" /> {ev.location}
                          </span>
                        )}
                        {ev.attendees && ev.attendees.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="size-3" /> {ev.attendees.length}
                          </span>
                        )}
                        {ev.hangoutLink && (
                          <a
                            href={ev.hangoutLink}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            <Video className="size-3" /> Meet
                          </a>
                        )}
                        {ev.status && (
                          <Badge variant="outline" className="text-[10px] py-0">
                            {ev.status}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {ev.htmlLink && (
                        <Button asChild size="icon" variant="ghost">
                          <a href={ev.htmlLink} target="_blank" rel="noreferrer">
                            <ExternalLink className="size-4" />
                          </a>
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => openEdit(ev)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Delete this event?")) deleteMut.mutate(ev.id);
                        }}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
