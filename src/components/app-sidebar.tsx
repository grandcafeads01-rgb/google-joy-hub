import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard,
  Mail,
  HardDrive,
  ShoppingBag,
  Calendar as CalendarIcon,
  Settings,
  LogOut,
  Inbox,
  Send as SendIcon,
  FileText,
  AlertOctagon,
  ChevronRight,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { listGmailMessages, getGoogleConnection } from "@/lib/google.functions";
import { supabase } from "@/integrations/supabase/client";

const gmailFolders = [
  { key: "inbox", title: "Inbox", icon: Inbox },
  { key: "sent", title: "Sent", icon: SendIcon },
  { key: "drafts", title: "Drafts", icon: FileText },
  { key: "spam", title: "Spam", icon: AlertOctagon },
] as const;

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const currentSearch = useRouterState({ select: (r) => r.location.search }) as {
    folder?: string;
  };

  const fetchConn = useServerFn(getGoogleConnection);
  const fetchGmail = useServerFn(listGmailMessages);
  const conn = useQuery({ queryKey: ["google-conn"], queryFn: () => fetchConn() });
  const gmail = useQuery({
    queryKey: ["gmail-summary", "inbox"],
    queryFn: () => fetchGmail({ data: { folder: "inbox" } }),
    enabled: !!conn.data,
    refetchInterval: 30_000,
  });
  const unread = gmail.data?.connected ? gmail.data.messages.filter((m) => m.unread).length : 0;

  const gmailActive = currentPath.startsWith("/dashboard/gmail");
  const activeFolder = (currentSearch?.folder as string) || "inbox";

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground font-display font-bold">
            W
          </div>
          {!collapsed && (
            <div className="font-display font-bold text-lg">workspace.</div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigate</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={currentPath === "/dashboard"}
                  tooltip="Overview"
                >
                  <Link to="/dashboard" className="flex items-center gap-2">
                    <LayoutDashboard className="size-4" />
                    {!collapsed && <span>Overview</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Gmail with sub-items */}
              <Collapsible defaultOpen={gmailActive} className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton isActive={gmailActive} tooltip="Gmail">
                      <Mail className="size-4" />
                      {!collapsed && (
                        <>
                          <span className="flex-1 text-left">Gmail</span>
                          {unread > 0 && (
                            <Badge className="bg-[color:var(--color-gmail)] text-white mr-1">
                              {unread}
                            </Badge>
                          )}
                          <ChevronRight className="size-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                        </>
                      )}
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  {!collapsed && (
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {gmailFolders.map((f) => (
                          <SidebarMenuSubItem key={f.key}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={gmailActive && activeFolder === f.key}
                            >
                              <Link
                                to="/dashboard/gmail"
                                search={{ folder: f.key }}
                                className="flex items-center gap-2"
                              >
                                <f.icon className="size-3.5" />
                                <span className="flex-1">{f.title}</span>
                                {f.key === "inbox" && unread > 0 && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] h-4 px-1.5"
                                  >
                                    {unread}
                                  </Badge>
                                )}
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  )}
                </SidebarMenuItem>
              </Collapsible>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={currentPath.startsWith("/dashboard/drive")}
                  tooltip="Drive"
                >
                  <Link to="/dashboard/drive" className="flex items-center gap-2">
                    <HardDrive className="size-4" />
                    {!collapsed && <span>Drive</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={currentPath.startsWith("/dashboard/merchant")}
                  tooltip="Merchant Center"
                >
                  <Link to="/dashboard/merchant" className="flex items-center gap-2">
                    <ShoppingBag className="size-4" />
                    {!collapsed && <span>Merchant Center</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={currentPath.startsWith("/dashboard/settings")}
                  tooltip="Settings"
                >
                  <Link to="/dashboard/settings" className="flex items-center gap-2">
                    <Settings className="size-4" />
                    {!collapsed && <span>Settings</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-2">
        {!collapsed && conn.data?.email && (
          <div className="px-2 pb-2 text-xs text-muted-foreground truncate">
            {conn.data.email}
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Sign out">
              <LogOut className="size-4" />
              {!collapsed && <span>Sign out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
