import React from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/layout/AppLayout";

// Shell for the public home page ("/", pages/Home.jsx): signed-in users get
// the normal app shell (menu, bottom tabs, profile-completion redirect);
// visitors get the page alone, which draws its own header.
export default function HomeLayout() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  return isAuthenticated ? <AppLayout /> : <Outlet />;
}
