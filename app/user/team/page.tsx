"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getIdTokenOrNull } from "@/lib/auth-client";
import { usePageTitle } from "@/lib/use-page-title";
import { PreviewSidebar } from "../PreviewSidebar";

type Role = "owner" | "admin" | "member";
type Member = { uid: string; role: Role; email: string | null; name: string | null; isYou: boolean };
type Invite = { token: string; email: string; role: string };

async function authedFetch(url: string, init?: RequestInit) {
  const token = await getIdTokenOrNull();
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

const swrFetcher = (url: string) =>
  authedFetch(url).then((r) => {
    if (!r.ok) throw new Error("fetch_failed");
    return r.json();
  });

const ROLE_PILL: Record<Role, string> = {
  owner: "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900",
  admin: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  member: "bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-300",
};

export default function TeamPage() {
  usePageTitle("Team");
  const router = useRouter();

  const [authChecking, setAuthChecking] = useState(true);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState<string | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/");
        return;
      }
      setAuthChecking(false);
    });
    return () => unsub();
  }, [router]);

  const {
    data: membersData,
    isLoading: membersLoading,
    mutate: mutateMembers,
  } = useSWR(authChecking ? null : "/api/org/members", swrFetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 5000,
  });
  const { data: meData } = useSWR(authChecking ? null : "/api/user/me", swrFetcher, {
    dedupingInterval: 5000,
  });

  const members: Member[] = Array.isArray(membersData?.members) ? membersData.members : [];
  const invites: Invite[] = Array.isArray(membersData?.invites) ? membersData.invites : [];
  const yourRole: Role = (membersData?.yourRole as Role) ?? "member";
  const plan: string | null = typeof meData?.plan === "string" ? meData.plan : null;
  const loading = membersLoading && !membersData;

  const inviteLinkFor = (token: string) =>
    typeof window !== "undefined" ? `${window.location.origin}/invite?token=${token}` : "";

  const copy = (token: string) => {
    navigator.clipboard.writeText(inviteLinkFor(token)).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email.includes("@")) return setError("Enter a valid email address.");
    setBusy("invite");
    setError(null);
    setLastInviteLink(null);
    try {
      const res = await authedFetch("/api/org/invite", {
        method: "POST",
        body: JSON.stringify({ email, role: inviteRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data?.error === "team_plan_required"
            ? "Inviting teammates requires the Team plan."
            : data?.error === "valid_email_required"
            ? "Enter a valid email address."
            : "Could not create the invite."
        );
        return;
      }
      setInviteEmail("");
      setLastInviteLink(inviteLinkFor(data.token));
      await mutateMembers();
    } finally {
      setBusy(null);
    }
  };

  const manage = async (action: "remove" | "role", uid: string, role?: "member" | "admin") => {
    setBusy(uid);
    setError(null);
    try {
      const res = await authedFetch("/api/org/members/manage", {
        method: "POST",
        body: JSON.stringify({ action, uid, role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ? `Action failed: ${data.error}` : "Action failed.");
        return;
      }
      await mutateMembers();
    } finally {
      setBusy(null);
    }
  };

  const canManage = yourRole === "owner" || yourRole === "admin";
  const isTeam = plan === "team";

  if (authChecking) return <div className="min-h-screen bg-white dark:bg-[#0a0a0a]" />;

  return (
    <div
      className={`min-h-screen bg-white dark:bg-[#0a0a0a] transition-[padding] duration-300 ${
        navCollapsed ? "lg:pl-[68px]" : "lg:pl-[260px]"
      }`}
    >
      <PreviewSidebar active="team" collapsed={navCollapsed} onToggle={() => setNavCollapsed((v) => !v)} />

      {/* Header */}
      <div className="border-b border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0a0a0a] sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-6 lg:px-10 py-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <nav className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
                <a href="/user/dashboard" className="hover:text-gray-900 dark:hover:text-gray-200">Dashboard</a>
                <ChevronTiny />
                <span className="text-gray-700 dark:text-gray-200 font-medium">Team</span>
              </nav>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50 tracking-tight">Team</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Invite teammates and manage who can review your candidate pipelines.</p>
            </div>
            <span className="px-2.5 py-1 rounded-lg text-xs font-medium capitalize bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
              {plan ? plan.replace("_", " ") : "Free"} plan
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 lg:px-10 py-8 space-y-6">
        {error && (
          <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 dark:text-rose-300 dark:bg-rose-500/10 dark:border-rose-500/20">
            {error}
          </div>
        )}

        {/* Plan gate */}
        {!isTeam && !loading && (
          <div className="bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/80 dark:border-white/[0.06] p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1 dark:text-gray-100 tracking-tight">Bring your team</h2>
            <p className="text-sm text-gray-600 mb-4 dark:text-gray-400">
              The Team plan adds a shared workspace — invite teammates as Admins or Members so
              everyone reviews the same candidate pipelines. You&apos;re currently on the{" "}
              <span className="font-medium">{plan ? plan.replace("_", " ") : "Free"}</span> plan.
            </p>
            <button
              type="button"
              onClick={() => router.push("/user/billing")}
              className="inline-flex items-center px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
            >
              Upgrade to Team
            </button>
          </div>
        )}

        {/* Invite */}
        {isTeam && canManage && (
          <section className="bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/80 dark:border-white/[0.06] p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1 dark:text-gray-100 tracking-tight">Invite a teammate</h2>
            <p className="text-sm text-gray-600 mb-4 dark:text-gray-400">
              They&apos;ll get a link to join with their Google account. The invite is locked to
              the email you enter.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                placeholder="teammate@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/40"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "member" | "admin")}
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] text-gray-900 dark:text-gray-100 text-sm"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="button"
                disabled={busy === "invite"}
                onClick={handleInvite}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
              >
                {busy === "invite" ? "Creating…" : "Create invite"}
              </button>
            </div>
            {lastInviteLink && (
              <div className="mt-3 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 dark:bg-emerald-500/10 dark:border-emerald-500/20">
                <code className="text-xs text-emerald-900 truncate flex-1 dark:text-emerald-200">{lastInviteLink}</code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(lastInviteLink)}
                  className="text-xs font-medium text-emerald-800 hover:text-emerald-900 shrink-0 dark:text-emerald-300 dark:hover:text-emerald-200"
                >
                  Copy
                </button>
              </div>
            )}
          </section>
        )}

        {/* Members */}
        <section className="bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/80 dark:border-white/[0.06] overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-white/[0.05]">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Members {loading ? "" : `(${members.length})`}
            </h2>
          </div>
          {loading ? (
            <div className="p-6 space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse dark:bg-white/[0.04]" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {members.map((mem) => (
                <li key={mem.uid} className="px-6 py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate dark:text-gray-100">
                      {mem.name || mem.email || mem.uid}
                      {mem.isYou && <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">(you)</span>}
                    </p>
                    {mem.email && mem.name && (
                      <p className="text-xs text-gray-500 truncate dark:text-gray-400">{mem.email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ROLE_PILL[mem.role]}`}>
                      {mem.role}
                    </span>
                    {canManage && !mem.isYou && mem.role !== "owner" && (
                      <>
                        {yourRole === "owner" && (
                          <button
                            type="button"
                            disabled={busy === mem.uid}
                            onClick={() => manage("role", mem.uid, mem.role === "admin" ? "member" : "admin")}
                            className="text-xs text-gray-600 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-100"
                          >
                            {mem.role === "admin" ? "Make member" : "Make admin"}
                          </button>
                        )}
                        {(yourRole === "owner" || mem.role === "member") && (
                          <button
                            type="button"
                            disabled={busy === mem.uid}
                            onClick={() => manage("remove", mem.uid)}
                            className="text-xs text-rose-600 hover:text-rose-700 disabled:opacity-50 dark:text-rose-400 dark:hover:text-rose-300"
                          >
                            Remove
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Pending invites */}
        {isTeam && canManage && invites.length > 0 && (
          <section className="bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-200/80 dark:border-white/[0.06] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-white/[0.05]">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Pending invites ({invites.length})</h2>
            </div>
            <ul className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {invites.map((inv) => (
                <li key={inv.token} className="px-6 py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate dark:text-gray-100">{inv.email}</p>
                    <p className="text-xs text-gray-500 capitalize dark:text-gray-400">{inv.role} · awaiting acceptance</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copy(inv.token)}
                    className="text-xs font-medium text-gray-700 hover:text-gray-900 shrink-0 dark:text-gray-300 dark:hover:text-gray-100"
                  >
                    {copied === inv.token ? "Copied!" : "Copy link"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function ChevronTiny() {
  return <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>;
}
