"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut, onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getIdTokenOrNull } from "@/lib/auth-client";
import { SWRProvider } from "@/lib/swr-config";
import useSWR from "swr";
import { UserSidebar } from "./UserSidebar";

const fetcher = async (url: string) => {
  const token = await getIdTokenOrNull();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
};

/**
 * Authenticated employer shell. Renders the global sidebar on every /user page
 * EXCEPT focused full-screen tasks (the edit-role page), and wraps everything
 * in the shared SWR provider. The sidebar fetches its own data so individual
 * pages don't have to wire it up.
 */
const NO_SIDEBAR_PATHS = new Set<string>(["/user/jd/confirm"]);

type Me = { plan: "free" | "single_role" | "team" | null; screensRemaining: number; orgId: string | null };
type Org = { orgId: string; name: string; plan: string | null; role: string | null; isActive: boolean };

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const hideSidebar = NO_SIDEBAR_PATHS.has(pathname);

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

  const { data: me } = useSWR<Me>(user ? "/api/user/me" : null, fetcher);
  const { data: orgData } = useSWR<{ orgs: Org[] }>(user ? "/api/org/list" : null, fetcher);
  const orgs = orgData?.orgs || [];

  const toggleSidebar = () =>
    setCollapsed((c) => {
      if (typeof window !== "undefined") localStorage.setItem("ew_sidebar_collapsed", c ? "0" : "1");
      return !c;
    });

  const handleSwitchOrg = async (orgId: string) => {
    try {
      const token = await getIdTokenOrNull();
      await fetch("/api/org/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ orgId }),
      });
      window.location.reload();
    } catch {
      /* ignore */
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/");
  };

  // Focused pages, pre-auth, or logged-out → no sidebar (the page handles redirect).
  if (hideSidebar || !authReady || !user) {
    return <SWRProvider>{children}</SWRProvider>;
  }

  const planLabel = me?.plan === "team" ? "Team" : me?.plan === "single_role" ? "Single Role" : "Free";

  return (
    <SWRProvider>
      <div
        className={`min-h-screen bg-gray-50 dark:bg-[#0a0a0e] dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] transition-[padding] duration-200 ${
          collapsed ? "pl-12" : "pl-60"
        }`}
      >
        <UserSidebar
          planLabel={planLabel}
          screensRemaining={me?.screensRemaining ?? 0}
          plan={me?.plan ?? null}
          orgs={orgs}
          activeOrgId={me?.orgId ?? null}
          onSwitchOrg={handleSwitchOrg}
          onLogout={handleLogout}
          userName={user.displayName}
          userEmail={user.email}
          collapsed={collapsed}
          onToggle={toggleSidebar}
        />
        {children}
      </div>
    </SWRProvider>
  );
}
