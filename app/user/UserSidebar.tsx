"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Org = { orgId: string; name: string; plan: string | null; role: string | null; isActive: boolean };

const HamburgerIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export function UserSidebar(props: {
  planLabel: string;
  screensRemaining: number;
  plan: string | null;
  orgs: Org[];
  activeOrgId: string | null;
  onSwitchOrg: (orgId: string) => void;
  onLogout: () => void;
  userName: string | null;
  userEmail: string | null;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const {
    planLabel,
    screensRemaining,
    plan,
    orgs,
    activeOrgId,
    onSwitchOrg,
    onLogout,
    userName,
    userEmail,
    collapsed,
    onToggle,
  } = props;
  const pathname = usePathname();
  const name = userName || userEmail || "Account";
  const initials = (userName || userEmail || "?").trim().slice(0, 2).toUpperCase();

  // Collapsed → a thin rail with just the expand button. This avoids the
  // floating-button-over-content overlap and keeps a gutter so page titles
  // never sit under the toggle.
  if (collapsed) {
    return (
      <aside className="fixed left-0 top-0 bottom-0 w-12 border-r border-gray-200 bg-white flex flex-col items-center py-4 z-30 dark:bg-gray-900 dark:border-gray-800">
        <button
          type="button"
          onClick={onToggle}
          title="Expand sidebar"
          className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 p-1"
        >
          {HamburgerIcon}
        </button>
      </aside>
    );
  }

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 border-r border-gray-200 bg-white flex flex-col z-30 dark:bg-gray-900 dark:border-gray-800">
      {/* Brand + collapse */}
      <div className="px-4 py-4 flex items-center justify-between">
        <Link href="/user/dashboard" className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
          EigenWork
        </Link>
        <button
          type="button"
          onClick={onToggle}
          title="Collapse sidebar"
          className="text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 p-1"
        >
          {HamburgerIcon}
        </button>
      </div>

      {/* Workspace switcher */}
      {orgs.length > 1 && (
        <div className="px-3 pb-2">
          <select
            value={activeOrgId ?? ""}
            onChange={(e) => onSwitchOrg(e.target.value)}
            className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 text-gray-800 rounded-lg text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
            title="Switch workspace"
          >
            {orgs.map((o) => (
              <option key={o.orgId} value={o.orgId}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        <SidebarLink href="/user/dashboard" label="Dashboard" active={pathname === "/user/dashboard"} />
        {plan === "team" && <SidebarLink href="/user/team" label="Team" active={pathname === "/user/team"} />}
        <SidebarLink href="/user/billing" label="Buy / Upgrade" active={pathname === "/user/billing"} />
        <SidebarLink href="/pricing" label="Pricing" active={pathname === "/pricing"} />
        <SidebarLink href="/user/settings" label="Settings" active={pathname === "/user/settings"} />
      </nav>

      {/* Screens remaining */}
      <div className="mx-2 mb-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 dark:bg-gray-800 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400">Screens remaining</p>
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{screensRemaining.toLocaleString()}</p>
      </div>

      {/* User + tier */}
      <div className="border-t border-gray-200 dark:border-gray-800 px-3 py-3 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 flex items-center justify-center text-xs font-semibold shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{planLabel} tier</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          title="Log out"
          className="text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 shrink-0 p-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
        </button>
      </div>
    </aside>
  );
}

function SidebarLink({ href, label, active }: { href: string; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
          : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
      }`}
    >
      {label}
    </Link>
  );
}
