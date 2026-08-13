import React, { useState, useEffect, useRef, startTransition, Suspense } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import {
  LayoutDashboard, CalendarHeart, Bell, Menu, X, LogOut, Sparkles, UserCircle, ChevronRight, ShieldCheck, Mail, AlertCircle, MapPin, CalendarRange, Building2, Heart } from
"lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import Footer from "@/components/layout/Footer";
import BottomTabBar from "@/components/layout/BottomTabBar";
import InstallAppBanner from "@/components/shared/InstallAppBanner";
import useNavigationDirection from "@/hooks/useNavigationDirection";
import { useT } from "@/lib/i18n";

function useNavItems() {
  const t = useT();
  const { user } = useAuth();
  const isVenueOwner = user?.role === "venue_owner";
  return [
  { path: "/dashboard", icon: LayoutDashboard, label: t.dashboard, adminOnly: true },
  { path: "/my-invitations", icon: Mail, label: t.myInvitations },
  { path: "/my-event", icon: CalendarHeart, label: t.myEvent, userOnly: true },
  { path: "/events", icon: CalendarHeart, label: t.events, adminOnly: true },
  { path: "/planned-weddings", icon: Heart, label: isVenueOwner ? t.plannedWeddings : t.upcomingWeddings, venueOwner: true },
  { path: "/notifications", icon: Bell, label: t.notifications },
  { path: "/users", icon: ShieldCheck, label: t.users, privileged: true },
  { path: "/venues", icon: MapPin, label: t.venues, privileged: true },
  { path: "/venue-schedule", icon: CalendarRange, label: t.venueScheduleTitle || "לוח אולמות", venueOwner: true },
  { path: "/my-venues", icon: Building2, label: t.myVenuesManage, venueOwnerOnly: true },
  { path: "/event-requests", icon: CalendarHeart, label: t.eventRequests, privileged: true },
  { path: "/profile", icon: UserCircle, label: t.profile }];

}

const getPageVariants = (direction) => ({
  initial: { opacity: 0, x: direction === "back" ? -24 : 24, pointerEvents: "none" },
  animate: { opacity: 1, x: 0, pointerEvents: "auto" },
  exit: { opacity: 0, x: direction === "back" ? 24 : -24, pointerEvents: "none" }
});

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const t = useT();
  const navItems = useNavItems();
  const hasRedirectedOnLogin = useRef(false);

  // Android back button: close sidebar if open
  useEffect(() => {
    if (!sidebarOpen) return;
    window.history.pushState({ sidebar: true }, "");
    const handler = () => setSidebarOpen(false);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [sidebarOpen]);
  const rootPaths = ["/", "/dashboard", "/my-invitations", "/my-event", "/events", "/notifications", "/profile", "/venue-schedule"];
  const direction = useNavigationDirection();

  // Profile completion check
  const isProfileIncomplete = user && isAuthenticated && (
  !user.first_name || !user.last_name || !user.town || !user.phone);

  const isOnProfilePage = location.pathname === "/profile";

  useEffect(() => {
    if (!user) return;
    if (!hasRedirectedOnLogin.current) {
      hasRedirectedOnLogin.current = true;
      if (isProfileIncomplete) {
        navigate("/profile", { replace: true });
      } else if (isOnProfilePage) {
        // Complete profile but landed on /profile (e.g. from login redirect) — go to invitations
        navigate("/", { replace: true });
      }
      return;
    }
    // Subsequent navigations: still enforce profile completion
    if (isProfileIncomplete && !isOnProfilePage) {
      navigate("/profile", { replace: true });
    }
  }, [isProfileIncomplete, isOnProfilePage, user]);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["unread-notifications", user?.email],
    queryFn: async () => {
      const [notifs, invitations] = await Promise.all([
      base44.entities.Notification.filter({ is_read: false, target_user_email: user?.email }),
      base44.entities.InvitationRecipient.filter({ email: user?.email })]
      );
      // Count invitations that were recently created or updated (within last 7 days) and not yet seen
      const seenKey = `seen_invitations_${user.email}`;
      const seenIds = JSON.parse(localStorage.getItem(seenKey) || "[]");
      const recentMs = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const newInvitations = invitations.filter((inv) => {
        if (seenIds.includes(inv.id)) return false;
        // Was inv.updated_date || inv.created_date — Base44 field names
        // that never existed on this API's MyInvitationRecipientOut, so
        // `new Date(undefined)` was NaN and this filter silently matched
        // nothing, ever. created_at is the real field (added alongside
        // this fix — see schemas.py).
        const created = new Date(inv.created_at).getTime();
        return now - created < recentMs;
      });
      return notifs.length + newInvitations.length;
    },
    enabled: !!user?.email,
    refetchInterval: 30000
  });

  const isActive = (path) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <div dir="rtl" className="h-screen bg-background flex overflow-hidden">
      {/* Skip to main content link for screen readers */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:right-2 focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-medium">
        
        {t.skipToContent}
      </a>
      {/* Mobile sidebar overlay */}
      {sidebarOpen &&
      <div
        className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm"
        onClick={() => setSidebarOpen(false)} />

      }

      {/* Desktop Sidebar */}
      <aside
        id="sidebar"
        aria-label={t.mainMenu}
        className={`fixed lg:sticky top-0 right-0 z-50 h-screen w-72 bg-card border-l border-border
          transform transition-transform duration-300 ease-out
          ${sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"}
          flex flex-col`}>
        
        {/* Logo */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center bg-[hsl(var(--primary))]">
                <img src="https://media.base44.com/images/public/69c3f1e5c5d379e64b05a015/168b83f89_daawateylogo.png" alt="Daawatey Logo" className="w-full h-full object-cover" />
              </div>
              <div>
                <h1 className="font-display text-lg font-bold text-foreground">دعوتي</h1>
                <p className="text-xs text-muted-foreground">{t.smartInvitations}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)} aria-label={t.closeMenu}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto" aria-label={t.mainMenu}>
          {navItems.filter((item) => {
            const isPrivileged = user?.role === "admin" || user?.role === "manager";
            const isVenueOwner = user?.role === "venue_owner";
            if (item.privileged && !isPrivileged) return false;
            if (item.adminOnly && !isPrivileged) return false;
            if (item.userOnly && isPrivileged) return false;
            if (item.venueOwner && !isPrivileged && !isVenueOwner) return false;
            if (item.venueOwnerOnly && !isVenueOwner) return false;
            return true;
          }).map((item) =>
          <Link
            key={item.path}
            to={item.path}
            onClick={(e) => {
              if (!isAuthenticated) {e.preventDefault();base44.auth.redirectToLogin(window.location.href);return;}
              setSidebarOpen(false);
            }}
            aria-current={isActive(item.path) ? "page" : undefined}
            className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-200
                ${isActive(item.path) ?
            "bg-primary text-primary-foreground shadow-md" :
            "text-muted-foreground hover:bg-accent hover:text-foreground"}`
            }>
            
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span>{item.label}</span>
              {item.path === "/notifications" && unreadCount > 0 &&
            <Badge className="mr-auto bg-destructive text-destructive-foreground text-xs px-2 py-0.5">
                  {unreadCount}
                </Badge>
            }
            </Link>
          )}
        </nav>

        {/* Language switcher */}
        <div className="px-4 pb-2">
          <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
            {[{ code: "ar", label: "ع" }, { code: "he", label: "ע" }].map(({ code, label }) => {
              const active = (user?.preferred_language || "ar") === code;
              return (
                <button
                  key={code}
                  onClick={async () => {
                    await base44.auth.updateMe({ preferred_language: code });
                    window.location.reload();
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                  active ?
                  "bg-primary text-primary-foreground shadow-sm" :
                  "text-muted-foreground hover:text-foreground"}`
                  }>
                  
                  {label}
                </button>);

            })}
          </div>
        </div>

        {/* User */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-semibold text-primary">{user?.full_name?.[0] || "U"}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{[user?.nickname, user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.full_name || "مستخدم"}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="flex-shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => base44.auth.logout()}
              aria-label={t.logout}>
              
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main id="main-content" className="flex-1 h-screen flex flex-col overflow-hidden" tabIndex={-1}>
        {/* Top bar (mobile: hamburger, desktop: hidden) */}
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border px-4 lg:px-8 min-h-14 flex items-center gap-4" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label={t.openMenu}
            aria-expanded={sidebarOpen}
            aria-controls="sidebar">
            <Menu className="w-5 h-5" />
          </Button>
          {!rootPaths.includes(location.pathname) &&
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => startTransition(() => navigate(-1))}
            aria-label={t.back}>
            <ChevronRight className="w-5 h-5" />
          </Button>
          }
          <div className="flex items-center gap-2 lg:hidden">
            <img src="https://media.base44.com/images/public/69c3f1e5c5d379e64b05a015/168b83f89_daawateylogo.png" alt="Daawatey Logo" className="w-7 h-7 rounded-lg object-cover" />
            <span className="font-display font-bold text-foreground">دعوتي</span>
          </div>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" className="relative" asChild>
            <Link to="/notifications" aria-label={unreadCount > 0 ? `الإشعارات - ${unreadCount} غير مقروء` : "الإشعارات"}>
              <Bell className="w-5 h-5" />
              {unreadCount > 0 &&
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              }
            </Link>
          </Button>
        </header>

        {/* Page content with Framer Motion transitions */}
        <div
          className="flex-1 p-4 lg:p-8 overflow-y-auto pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-8">
          
          {/* Profile completion banner */}
          {isProfileIncomplete && isOnProfilePage &&
          <div className="mb-4 flex items-start gap-3 bg-warning/10 border border-warning/30 text-warning rounded-xl px-4 py-3 text-sm font-medium">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{t.completeProfile}</span>
            </div>
          }

          {/* Android app install nudge — mobile web only, see InstallAppBanner.jsx */}
          <InstallAppBanner />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              variants={getPageVariants(direction)}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.22, ease: "easeInOut" }}
              style={{ minHeight: "100%", pointerEvents: "auto" }}
              className="w-full">
              
              <Suspense fallback={
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                </div>
              }>
                <Outlet />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </div>
        
        {/* Footer */}
        <Footer />

        {/* Mobile bottom tab bar */}
        <BottomTabBar unreadCount={unreadCount} userRole={user?.role} isAuthenticated={isAuthenticated} />
      </main>

    </div>);

}