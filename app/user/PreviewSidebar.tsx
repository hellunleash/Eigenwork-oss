"use client";

// ============================================================================
// PreviewSidebar — the single app-wide employer sidebar. The legacy text sidebar
// (UserSidebar) is gone; app/user/layout.tsx renders this on every /user page,
// and the promoted surfaces (/user/dashboard, /user/pipelines, /user/analytics)
// render it themselves (layout skips them via SELF_SHELL_PATHS). Design unchanged
// from the preview — data + controls are connected:
//   • workspace switcher → real orgs + /api/org/switch (native select overlay
//     when the user belongs to more than one org)
//   • New role           → /user/jd
//   • nav                → real routes (active derived from the path); Analytics on Team
//   • user footer        → real name / workspace + Settings / Log out menu
// Controls with no backend yet (Search ⌘K, Help & docs) are KEPT as designed but
// flagged as "coming soon" on click rather than stripped out.
// ============================================================================

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getIdTokenOrNull } from "@/lib/auth-client";

export type PreviewNavKey =
  | "dashboard"
  | "pipelines"
  | "analytics"
  | "team"
  | "billing";

type Me = { plan: "free" | "single_role" | "team" | null; orgId: string | null };
type Org = { orgId: string; name: string; plan: string | null; role: string | null; isActive: boolean };

const fetcher = async (url: string) => {
  const token = await getIdTokenOrNull();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
};

const notifySoon = (label: string) =>
  typeof window !== "undefined" && window.alert(`${label} isn’t wired up yet — coming soon.`);

export function PreviewSidebar({
  collapsed,
  onToggle,
}: {
  // `active` is accepted for backward-compat with existing call sites, but the
  // highlight is derived from the path so it is correct no matter who renders it.
  active?: PreviewNavKey;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);
  useEffect(() => {
    // Read the theme once on mount (the <html> class is set pre-hydration by the
    // inline script in app/layout.tsx). Done in an effect — not lazy initial
    // state — so the server and client first render agree (no hydration mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);
  useEffect(() => {
    if (!userMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [userMenuOpen]);

  const { data: me } = useSWR<Me>(user ? "/api/user/me" : null, fetcher);
  const { data: orgData } = useSWR<{ orgs: Org[] }>(user ? "/api/org/list" : null, fetcher);
  const orgs = orgData?.orgs ?? [];
  const plan = me?.plan ?? null;

  const activeOrg = orgs.find((o) => o.isActive) ?? orgs.find((o) => o.orgId === me?.orgId) ?? null;
  const workspaceName = activeOrg?.name || "My Workspace";
  const workspaceSub = plan === "team" ? "Team workspace" : plan === "single_role" ? "Single Role" : "Free workspace";

  const displayName = user?.displayName || user?.email || "Account";
  const initials = (user?.displayName || user?.email || "?").trim().slice(0, 2).toUpperCase();

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

  // Dark-mode toggle — same mechanism the (now-removed) Settings page used:
  // flip the `dark` class on <html> and persist the choice under localStorage.theme.
  const toggleDarkMode = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", nextDark);
      try {
        localStorage.setItem("theme", nextDark ? "dark" : "light");
      } catch {
        /* storage may be unavailable; the visual class toggle is what matters */
      }
    }
  };

  return (
    <aside
      className={`hidden lg:flex flex-col fixed top-0 left-0 h-screen z-40 border-r border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0a0a0a] transition-[width] duration-300 ${
        collapsed ? "w-[68px]" : "w-[260px]"
      }`}
    >
      {/* Workspace switcher */}
      <div className="relative flex items-center gap-2.5 h-16 px-3 border-b border-gray-100 dark:border-white/[0.05] shrink-0">
        <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0 text-white">
          <SbLogo />
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate leading-tight">
                {workspaceName}
              </p>
              <p className="text-[11px] text-gray-500 truncate">{workspaceSub}</p>
            </div>
            <SbChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          </>
        )}
        {orgs.length > 1 && (
          <select
            value={activeOrg?.orgId ?? ""}
            onChange={(e) => handleSwitchOrg(e.target.value)}
            title="Switch workspace"
            aria-label="Switch workspace"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            {orgs.map((o) => (
              <option key={o.orgId} value={o.orgId}>
                {o.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* New role + search */}
      <div className="px-3 py-3 space-y-2">
        <Link
          href="/user/jd"
          title={collapsed ? "New role" : undefined}
          className={`flex items-center gap-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium px-3 py-2 hover:opacity-90 transition ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <SbPlus />
          {!collapsed && <span>New role</span>}
        </Link>
        <button
          type="button"
          onClick={() => notifySoon("Search")}
          title={collapsed ? "Search (coming soon)" : undefined}
          className={`w-full flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/[0.08] text-sm text-gray-500 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <SbSearch className="w-4 h-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Search&hellip;</span>
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.06] text-gray-400">
                &#8984;K
              </kbd>
            </>
          )}
        </button>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
        {!collapsed && <NavLabel>Workspace</NavLabel>}
        <NavItem collapsed={collapsed} icon={<SbGrid />} label="Dashboard" href="/user/dashboard" active={pathname === "/user/dashboard"} />
        <NavItem collapsed={collapsed} icon={<SbFunnel />} label="Role pipelines" href="/user/pipelines" active={pathname.startsWith("/user/pipelines") || pathname.startsWith("/user/jd")} />
        {plan === "team" && (
          <NavItem collapsed={collapsed} icon={<SbUsers />} label="Team" href="/user/team" active={pathname.startsWith("/user/team")} />
        )}
        {plan === "team" && (
          <>
            {!collapsed && <NavLabel>Insights</NavLabel>}
            <NavItem collapsed={collapsed} icon={<SbChart />} label="Analytics" href="/user/analytics" active={pathname.startsWith("/user/analytics")} />
          </>
        )}
        <NavItem collapsed={collapsed} icon={<SbCard />} label="Billing" href="/user/billing" active={pathname.startsWith("/user/billing")} />
      </nav>

      {/* Secondary nav */}
      <div className="px-3 py-3 border-t border-gray-100 dark:border-white/[0.05] space-y-0.5">
        <NavItem collapsed={collapsed} icon={isDark ? <SbSun /> : <SbMoon />} label={isDark ? "Light mode" : "Dark mode"} onClick={toggleDarkMode} />
        <NavItem collapsed={collapsed} icon={<SbHelp />} label="Help & docs" onClick={() => notifySoon("Help & docs")} />
      </div>

      {/* User + collapse toggle */}
      <div className="px-3 py-3 border-t border-gray-100 dark:border-white/[0.05]">
        {collapsed ? (
          <button
            type="button"
            onClick={onToggle}
            title="Expand"
            className="mx-auto flex items-center justify-center w-9 h-9 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-gray-700 dark:hover:text-gray-200 transition"
          >
            <SbCollapse className="w-4 h-4 rotate-180" />
          </button>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="relative min-w-0 flex-1" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="w-full flex items-center gap-2.5 min-w-0 rounded-md px-1 -mx-1 py-0.5 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
              >
                <div className="w-8 h-8 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 flex items-center justify-center text-xs font-semibold shrink-0">
                  {initials}
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{displayName}</p>
                  <p className="text-[11px] text-gray-500 truncate">{activeOrg?.name ? `${workspaceSub.split(" ")[0]} · ${activeOrg.name}` : workspaceSub}</p>
                </div>
              </button>
              {userMenuOpen && (
                <div role="menu" className="absolute bottom-full left-0 mb-1 w-44 z-50 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#16161c] shadow-lg py-1">
                  <button type="button" role="menuitem" onClick={() => { setUserMenuOpen(false); handleLogout(); }} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.05]">Log out</button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onToggle}
              title="Collapse"
              className="shrink-0 p-1.5 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-gray-700 dark:hover:text-gray-200 transition"
            >
              <SbCollapse className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function NavLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
      {children}
    </p>
  );
}

function NavItem({
  icon,
  label,
  href,
  onClick,
  active = false,
  collapsed,
}: {
  icon: ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  collapsed: boolean;
}) {
  const className = `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
    collapsed ? "justify-center" : ""
  } ${
    active
      ? "bg-gray-100 dark:bg-white/[0.06] text-gray-900 dark:text-white font-medium"
      : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] hover:text-gray-900 dark:hover:text-gray-100"
  }`;
  const inner = (
    <>
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-emerald-500" aria-hidden="true" />
      )}
      <span className="shrink-0 [&>svg]:w-[18px] [&>svg]:h-[18px]">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </>
  );
  // A real destination renders a Link; a not-yet-wired item keeps its look but
  // notifies on click instead of navigating nowhere.
  if (href) {
    return (
      <Link href={href} title={collapsed ? label : undefined} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} title={collapsed ? label : undefined} className={`w-full text-left ${className}`}>
      {inner}
    </button>
  );
}

// ----- Icons ----------------------------------------------------------------

function SbLogo({ className = "w-[18px] h-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 6h9M7 12h6M7 18h9" />
    </svg>
  );
}
function SbChevronDown({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
function SbSearch({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
function SbPlus({ className = "w-[18px] h-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function SbGrid({ className = "w-[18px] h-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function SbFunnel({ className = "w-[18px] h-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </svg>
  );
}
function SbUsers({ className = "w-[18px] h-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function SbChart({ className = "w-[18px] h-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20V4M4 20h16M9 20v-6M14 20v-9M19 20v-4" />
    </svg>
  );
}
function SbCard({ className = "w-[18px] h-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}
function SbMoon({ className = "w-[18px] h-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
function SbSun({ className = "w-[18px] h-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}
function SbHelp({ className = "w-[18px] h-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 113.5 2.3c-.8.4-1 .9-1 1.7" />
      <path d="M12 17h.01" />
    </svg>
  );
}
function SbCollapse({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 6l-6 6 6 6M20 6l-6 6 6 6" />
    </svg>
  );
}
