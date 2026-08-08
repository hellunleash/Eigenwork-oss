"use client";

// =============================================================================
// v3 "Three ways in, one engine" — reworked from three identical cards into an
// interactive tab switcher (real tablist semantics + arrow keys). Each door
// gets a wordless product-skeleton visual, so no copy is invented. The ATS
// door stays visually distinct: dashed, muted, amber "Coming soon".
// Copy identical to the live front-doors section.
// =============================================================================

import { useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { BoardIcon, HashGlyph, LinkIcon, WindowIcon } from "../icons";

type DoorId = "slack" | "web" | "ats";

const DOORS: {
  id: DoorId;
  icon: ReactNode;
  title: string;
  tagline: string;
  badge?: string;
  body: ReactNode;
}[] = [
  {
    id: "slack",
    icon: <HashGlyph className="w-4 h-4" />,
    title: "In Slack",
    tagline: "For the daily back-and-forth",
    body: (
      <>
        Ask who&rsquo;s strongest and why, mint an intake link, move a candidate to interview, draft
        outreach &mdash; without leaving the channel you already live in.
      </>
    ),
  },
  {
    id: "web",
    icon: <WindowIcon className="w-4 h-4" />,
    title: "On the web",
    tagline: "For the deep dive & setup",
    body: (
      <>
        The full ranked pipeline, every candidate&rsquo;s evidence, your hiring analytics, and the
        shared team workspace and billing.
      </>
    ),
  },
  {
    id: "ats",
    icon: <BoardIcon className="w-4 h-4" />,
    title: "In your ATS",
    tagline: "Ashby first",
    badge: "Coming soon",
    body: (
      <>
        Candidates still apply through your EigenWork link and get screened first &mdash; then the
        ranked shortlist, evidence, and notes land in <span className="italic">your own</span>{" "}
        Ashby, ready for your team. Your ATS is the finish line, not another intake form.
      </>
    ),
  },
];

export function FrontDoors() {
  const [active, setActive] = useState<DoorId>("slack");
  const tabRefs = useRef<Partial<Record<DoorId, HTMLButtonElement | null>>>({});
  const door = DOORS.find((d) => d.id === active)!;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = DOORS.findIndex((d) => d.id === active);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (idx + 1) % DOORS.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + DOORS.length) % DOORS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = DOORS.length - 1;
    if (next != null) {
      e.preventDefault();
      const id = DOORS[next].id;
      setActive(id);
      tabRefs.current[id]?.focus();
    }
  };

  return (
    <section id="how" className="py-24 md:py-32 border-y border-white/[0.05] bg-white/[0.015] scroll-mt-14">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="max-w-2xl">
          <h2 className="v3-display text-3xl md:text-5xl font-semibold leading-[1.05] text-zinc-50 text-balance">
            Use it where your team already works.
          </h2>
          <p className="mt-5 text-base md:text-lg text-zinc-400 leading-relaxed text-pretty">
            Slack, the web &mdash; and soon, right inside your own ATS. One engine behind every door:
            the same screens, the same shortlist, the same data. Switch anytime; nothing&rsquo;s
            trapped in one place.
          </p>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Where EigenWork runs"
          onKeyDown={onKeyDown}
          className="mt-10 inline-flex flex-wrap gap-1.5 p-1.5 rounded-2xl border border-white/[0.07] bg-white/[0.02]"
        >
          {DOORS.map((d) => {
            const selected = d.id === active;
            return (
              <button
                key={d.id}
                ref={(el) => {
                  tabRefs.current[d.id] = el;
                }}
                type="button"
                role="tab"
                id={`door-tab-${d.id}`}
                aria-selected={selected}
                aria-controls={`door-panel-${d.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(d.id)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  selected
                    ? "bg-emerald-400 text-emerald-950"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]"
                }`}
              >
                {d.icon}
                {d.title}
                {d.badge && (
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      selected ? "bg-emerald-950/15 text-emerald-950" : "bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {d.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Panel */}
        <div
          key={door.id}
          role="tabpanel"
          id={`door-panel-${door.id}`}
          aria-labelledby={`door-tab-${door.id}`}
          className="v3-panel-in mt-8 grid lg:grid-cols-[0.9fr_1.1fr] gap-10 items-center rounded-2xl border border-white/[0.07] bg-[#0e0e11] p-7 md:p-10"
        >
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-emerald-400">{door.tagline}</p>
            <h3 className="v3-display mt-3 text-2xl md:text-3xl font-medium text-zinc-50">{door.title}</h3>
            <p className="mt-4 text-base text-zinc-400 leading-relaxed text-pretty">{door.body}</p>
          </div>
          <DoorVisual id={door.id} />
        </div>

        <p className="mt-6 inline-flex items-center gap-2 text-sm text-zinc-500">
          <LinkIcon className="w-4 h-4 text-zinc-600" />
          One login, one workspace &mdash; the same data wherever you open it.
        </p>
      </div>
    </section>
  );
}

// ---------- Wordless product skeletons ---------------------------------------

function DoorVisual({ id }: { id: DoorId }) {
  if (id === "slack") return <SlackSkeleton />;
  if (id === "web") return <WebSkeleton />;
  return <AtsSkeleton />;
}

function Bar({ w, tone = "bg-white/[0.08]" }: { w: string; tone?: string }) {
  return <span className={`block h-2 rounded-full ${tone}`} style={{ width: w }} />;
}

function SlackSkeleton() {
  return (
    <div aria-hidden="true" className="rounded-xl border border-white/[0.07] bg-[#131316] p-5 space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-white/[0.06]">
        <HashGlyph className="w-3.5 h-3.5 text-zinc-600" />
        <Bar w="72px" />
      </div>
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-md bg-amber-500/80 shrink-0" />
        <div className="space-y-2 pt-1 w-full">
          <Bar w="34%" tone="bg-white/[0.14]" />
          <Bar w="78%" />
        </div>
      </div>
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-md bg-emerald-400 text-emerald-950 text-sm font-bold leading-none shrink-0 inline-flex items-center justify-center">E</span>
        <div className="space-y-2 pt-1 w-full">
          <Bar w="88%" tone="bg-emerald-400/25" />
          <Bar w="64%" tone="bg-emerald-400/15" />
          <div className="flex gap-2 pt-1.5">
            <span className="h-6 w-24 rounded-md border border-white/[0.1] bg-white/[0.03]" />
            <span className="h-6 w-20 rounded-md border border-white/[0.1] bg-white/[0.03]" />
            <span className="h-6 w-16 rounded-md border border-white/[0.1] bg-white/[0.03]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function WebSkeleton() {
  const rows: { rank: string; top?: boolean }[] = [{ rank: "#1", top: true }, { rank: "#2" }, { rank: "#3" }];
  return (
    <div aria-hidden="true" className="rounded-xl border border-white/[0.07] bg-[#131316] p-5 space-y-3">
      <div className="flex items-center gap-2 pb-3 border-b border-white/[0.06]">
        <span className="w-2 h-2 rounded-full bg-zinc-700" />
        <span className="w-2 h-2 rounded-full bg-zinc-700" />
        <span className="w-2 h-2 rounded-full bg-zinc-700" />
        <span className="ml-2 h-5 w-40 rounded bg-white/[0.05]" />
      </div>
      {rows.map((r) => (
        <div
          key={r.rank}
          className={`flex items-center gap-3 rounded-lg border p-3 ${
            r.top ? "border-emerald-400/25 bg-emerald-400/[0.05]" : "border-white/[0.06] bg-white/[0.02]"
          }`}
        >
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-xs font-semibold ${
              r.top ? "bg-emerald-400/20 text-emerald-300" : "bg-white/[0.06] text-zinc-400"
            }`}
          >
            {r.rank}
          </span>
          <div className="space-y-1.5 w-full">
            <Bar w="38%" tone="bg-white/[0.14]" />
            <Bar w="82%" />
          </div>
        </div>
      ))}
    </div>
  );
}

function AtsSkeleton() {
  return (
    <div aria-hidden="true" className="relative rounded-xl border border-dashed border-white/[0.14] bg-white/[0.01] p-5">
      <span className="absolute -top-2.5 right-4 inline-flex items-center px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 text-[11px] font-medium border border-amber-500/20">
        Coming soon
      </span>
      <div className="grid grid-cols-3 gap-3 opacity-70">
        {[3, 2, 2].map((cards, col) => (
          <div key={col} className="space-y-2.5">
            <Bar w="56%" tone="bg-white/[0.1]" />
            {Array.from({ length: cards }).map((_, i) => (
              <div key={i} className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-2.5 space-y-1.5">
                <Bar w="70%" tone="bg-white/[0.1]" />
                <Bar w="45%" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
