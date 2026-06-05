"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getIdTokenOrNull } from "@/lib/auth-client";
import { usePageTitle } from "@/lib/use-page-title";

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

const ROLE_PILL: Record<Role, string> = {
  owner: "bg-gray-900 text-white",
  admin: "bg-indigo-100 text-indigo-800",
  member: "bg-gray-100 text-gray-700",
};

export default function TeamPage() {
  usePageTitle("Team");
  const router = useRouter();

  const [authChecking, setAuthChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [yourRole, setYourRole] = useState<Role>("member");
  const [plan, setPlan] = useState<string | null>(null);

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

  const load = useCallback(async () => {
    setError(null);
    try {
      const [mRes, meRes] = await Promise.all([
        authedFetch("/api/org/members"),
        authedFetch("/api/user/me"),
      ]);
      if (!mRes.ok) throw new Error("Failed to load members");
      const m = await mRes.json();
      const me = meRes.ok ? await meRes.json() : {};
      setMembers(Array.isArray(m.members) ? m.members : []);
      setInvites(Array.isArray(m.invites) ? m.invites : []);
      setYourRole((m.yourRole as Role) ?? "member");
      setPlan(typeof me.plan === "string" ? me.plan : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load team");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authChecking) load();
  }, [authChecking, load]);

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
      await load();
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
      await load();
    } finally {
      setBusy(null);
    }
  };

  const canManage = yourRole === "owner" || yourRole === "admin";
  const isTeam = plan === "team";

  if (authChecking) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/user/dashboard" className="text-sm text-gray-500 hover:text-gray-800">
              ← Dashboard
            </Link>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Team</h1>
          </div>
          <span className="px-3 py-1.5 bg-gray-100 text-gray-800 rounded-lg text-sm font-medium capitalize">
            {plan ? plan.replace("_", " ") : "Free"} plan
          </span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Plan gate */}
        {!isTeam && !loading && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Bring your team</h2>
            <p className="text-sm text-gray-600 mb-4">
              The Team plan adds a shared workspace — invite teammates as Admins or Members so
              everyone reviews the same candidate pipelines. You&apos;re currently on the{" "}
              <span className="font-medium">{plan ? plan.replace("_", " ") : "Free"}</span> plan.
            </p>
            <Link
              href="/user/dashboard"
              className="inline-block px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
            >
              Upgrade to Team
            </Link>
          </div>
        )}

        {/* Invite */}
        {isTeam && canManage && (
          <section className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Invite a teammate</h2>
            <p className="text-sm text-gray-600 mb-4">
              They&apos;ll get a link to join with their Google account. The invite is locked to
              the email you enter.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                placeholder="teammate@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "member" | "admin")}
                className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm bg-white"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="button"
                disabled={busy === "invite"}
                onClick={handleInvite}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {busy === "invite" ? "Creating…" : "Create invite"}
              </button>
            </div>
            {lastInviteLink && (
              <div className="mt-3 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <code className="text-xs text-emerald-900 truncate flex-1">{lastInviteLink}</code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(lastInviteLink)}
                  className="text-xs font-medium text-emerald-800 hover:text-emerald-900 shrink-0"
                >
                  Copy
                </button>
              </div>
            )}
          </section>
        )}

        {/* Members */}
        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Members {loading ? "" : `(${members.length})`}
            </h2>
          </div>
          {loading ? (
            <div className="p-6 space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {members.map((mem) => (
                <li key={mem.uid} className="px-6 py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {mem.name || mem.email || mem.uid}
                      {mem.isYou && <span className="ml-2 text-xs text-gray-400">(you)</span>}
                    </p>
                    {mem.email && mem.name && (
                      <p className="text-xs text-gray-500 truncate">{mem.email}</p>
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
                            className="text-xs text-gray-600 hover:text-gray-900 disabled:opacity-50"
                          >
                            {mem.role === "admin" ? "Make member" : "Make admin"}
                          </button>
                        )}
                        {(yourRole === "owner" || mem.role === "member") && (
                          <button
                            type="button"
                            disabled={busy === mem.uid}
                            onClick={() => manage("remove", mem.uid)}
                            className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
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
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Pending invites ({invites.length})</h2>
            </div>
            <ul className="divide-y divide-gray-100">
              {invites.map((inv) => (
                <li key={inv.token} className="px-6 py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{inv.email}</p>
                    <p className="text-xs text-gray-500 capitalize">{inv.role} · awaiting acceptance</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copy(inv.token)}
                    className="text-xs font-medium text-gray-700 hover:text-gray-900 shrink-0"
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
