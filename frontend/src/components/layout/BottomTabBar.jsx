import React, { startTransition } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, CalendarHeart, Bell, UserCircle, Mail, CalendarRange } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";

// Remember the last deep path visited per tab root
const tabHistory = {};

export default function BottomTabBar({ unreadCount = 0, userRole, isAuthenticated }) {
  const location = useLocation();
  const navigate = useNavigate();
  const t = useT();
  const isPrivileged = userRole === "admin" || userRole === "manager";
  const isVenueOwner = userRole === "venue_owner";

  const adminTabs = [
    { path: "/dashboard", icon: LayoutDashboard, label: t.dashboard },
    { path: "/events", icon: CalendarHeart, label: t.events },
    { path: "/my-invitations", icon: Mail, label: t.myInvitations },
    { path: "/notifications", icon: Bell, label: t.notifications },
    { path: "/profile", icon: UserCircle, label: t.profile },
  ];

  const userTabs = [
    { path: "/my-invitations", icon: Mail, label: t.myInvitations },
    { path: "/my-event", icon: CalendarHeart, label: t.myEvent },
    { path: "/notifications", icon: Bell, label: t.notifications },
    { path: "/profile", icon: UserCircle, label: t.profile },
  ];

  const venueOwnerTabs = [
    { path: "/venue-schedule", icon: CalendarRange, label: t.venueScheduleTitle || "לוח אולמות" },
    { path: "/notifications", icon: Bell, label: t.notifications },
    { path: "/profile", icon: UserCircle, label: t.profile },
  ];

  const tabs = isPrivileged ? adminTabs : isVenueOwner ? venueOwnerTabs : userTabs;

  const isActive = (path) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  // Save current path into tab history whenever location changes
  const currentTab = tabs.find(t => isActive(t.path));
  if (currentTab) {
    tabHistory[currentTab.path] = location.pathname + location.search;
  }

  const handleTabClick = (e, tab) => {
    e.preventDefault();
    if (!isAuthenticated) {
      base44.auth.redirectToLogin(window.location.href);
      return;
    }
    if (isActive(tab.path)) {
      // On a nested sub-path of this tab — navigate back to the tab root
      if (location.pathname !== tab.path) {
        startTransition(() => navigate(tab.path));
        return;
      }
      // Already on the exact tab root — scroll to top
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // Restore last visited sub-page for this tab, or go to root
    const savedPath = tabHistory[tab.path] || tab.path;
    startTransition(() => navigate(savedPath));
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border lg:hidden flex"
      aria-label={t.mainMenu}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map((tab) => {
        const active = isActive(tab.path);
        return (
          <button
            key={tab.path}
            onClick={(e) => handleTabClick(e, tab)}
            aria-current={active ? "page" : undefined}
            aria-label={tab.path === "/notifications" && unreadCount > 0 ? `${tab.label} - ${unreadCount} غير مقروء` : tab.label}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 relative transition-colors duration-150
              ${active ? "text-primary" : "text-muted-foreground"}`}
            style={{ minHeight: 56 }}
          >
            <div className="relative">
              <tab.icon className={`w-5 h-5 transition-transform duration-150 ${active ? "scale-110" : ""}`} />
              {tab.path === "/notifications" && unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground text-[9px] rounded-full flex items-center justify-center font-bold">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>
            <span className={`text-[10px] font-medium leading-none ${active ? "text-primary" : "text-muted-foreground"}`}>
              {tab.label}
            </span>
            {active && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        );
      })}
    </nav>
  );
}