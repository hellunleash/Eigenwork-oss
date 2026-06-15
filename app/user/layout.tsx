"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { SWRProvider } from "@/lib/swr-config";
import { PreviewSidebar } from "./PreviewSidebar";

/**
 * Authenticated employer shell. There is now ONE sidebar everywhere: the modern
 * PreviewSidebar. The layout renders it on every /user page EXCEPT:
 *   - focused full-screen tasks (NO_SIDEBAR_PATHS, e.g. the edit-role page), and
 *   - the promoted surfaces that already render their own PreviewSidebar
 *     (SELF_SHELL_PATHS) — the layout skips those so two don't stack.
 * The legacy text sidebar (UserSidebar) has been removed. PreviewSidebar fetches
 * its own data and derives its active nav item from the path, so the layout only
 * owns the collapse state + the left padding.
 */
const NO_SIDEBAR_PATHS = new Set<string>(["/user/jd/confirm"]);
const SELF_SHELL_PATHS = new Set<string>([
  "/user/dashboard",
  "/user/pipelines",
  "/user/analytics",
  "/user/jd",
  "/user/jd/results",
  "/user/billing",
  "/user/team",
]);

export default function UserLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The layout renders its own sidebar only for the "legacy" pages — focused
  // tasks and the self-shell promoted pages opt out.
  // The results surface and its sub-routes (e.g. the interview pipeline at
  // /user/jd/results/[jobId]/interviews) all render their own PreviewSidebar.
  const hideLayoutSidebar =
    NO_SIDEBAR_PATHS.has(pathname) ||
    SELF_SHELL_PATHS.has(pathname) ||
    pathname.startsWith("/user/jd/results");

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("ew_sidebar_collapsed") === "1") {
      setCollapsed(true);
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const toggleSidebar = () =>
    setCollapsed((c) => {
      if (typeof window !== "undefined") localStorage.setItem("ew_sidebar_collapsed", c ? "0" : "1");
      return !c;
    });

  // Focused/self-shell pages, pre-auth, or logged-out → the layout adds no sidebar
  // (the page handles its own shell or its own redirect).
  if (hideLayoutSidebar || !authReady || !user) {
    return <SWRProvider>{children}</SWRProvider>;
  }

  return (
    <SWRProvider>
      <div
        className={`min-h-screen bg-gray-50 dark:bg-[#0a0a0e] dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] transition-[padding] duration-200 ${
          collapsed ? "lg:pl-[68px]" : "lg:pl-[260px]"
        }`}
      >
        <PreviewSidebar collapsed={collapsed} onToggle={toggleSidebar} />
        {children}
      </div>
    </SWRProvider>
  );
}
