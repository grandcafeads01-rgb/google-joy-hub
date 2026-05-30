import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LayoutDashboard, Mail, HardDrive, Settings, LogOut } from "lucide-react";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { listGmailMessages, getGoogleConnection } from "@/lib/google.functions";
import { supabase } from "@/integrations/supabase/client";

const items = [
  { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
  { title: "Gmail", url: "/dashboard/gmail", icon: Mail, key: "gmail" as const },
  { title: "Drive", url: "/dashboard/drive", icon: HardDrive },
  { title: "Settings", url: "/dashboard/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });

  const fetchConn = useServerFn(getGoogleConnection);
  const fetchGmail = useServerFn(listGmailMessages);
  const conn = useQuery({ queryKey: ["google-conn"], queryFn: () => fetchConn() });
  const gmail = useQuery({
    queryKey: ["gmail-summary"],
    queryFn: () => fetchGmail(),
    enabled: !!conn.data,
    refetchInterval: 30_000,
  });
  const unread = gmail.data?.connected ? gmail.data.messages.filter((m) => m.unread).length : 0;

  const isActive = (path: string) =>
    path === "/dashboard" ? currentPath === path : currentPath.startsWith(path);

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
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="size-4" />
                      {!collapsed && (
                        <>
                          <span className="flex-1">{item.title}</span>
                          {item.key === "gmail" && unread > 0 && (
                            <Badge className="bg-[color:var(--color-gmail)] text-white">
                              {unread}
                            </Badge>
                          )}
                        </>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
