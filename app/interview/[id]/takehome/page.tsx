"use client";

// Candidate-facing stage-4 take-home page (Phase 2). Data-driven: renders the assignment
// + reactive probes the plan produced. Token-authed via ?t=<accessToken>. Shares the
// lifecycle hook + compliance chrome with the screen / system-design pages.

import { useState } from "react";
import { useParams } from "next/navigation";
import { useInterviewRound } from "@/app/interview/_shared/use-interview-round";
import {
  InterviewFrame,
  StatusCard,
  PromptCard,
  LabeledTextarea,
  TextField,
  Honeypot,
  ConsentBlock,
  SubmitBar,
} from "@/app/interview/_shared/interview-ui";

type Probe = { id: string; prompt: string };
type TakeHomeData = {
  assignment: { prompt: string; timeboxHours: number | null; submissionFormat: string };
  probeQuestions: Probe[];
};

function parseTakeHome(json: unknown): TakeHomeData {
  const j = (json ?? {}) as Partial<TakeHomeData>;
  return {
    assignment: {
      prompt: j.assignment?.prompt ?? "",
      timeboxHours: j.assignment?.timeboxHours ?? null,
      submissionFormat: j.assignment?.submissionFormat ?? "repo",
    },
    probeQuestions: Array.isArray(j.probeQuestions) ? j.probeQuestions : [],
  };
}

export default function TakeHomePage() {
  const id = (useParams()?.id as string) || "";
  const s = useInterviewRound<TakeHomeData>(id, "/api/interview/takehome", parseTakeHome);
  const [url, setUrl] = useState("");
  const [walkthrough, setWalkthrough] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const probes = s.data?.probeQuestions ?? [];
  const allProbed = probes.length > 0 && probes.every((p) => (answers[p.id] ?? "").trim().length > 0);
  const urlOk = /^https?:\/\/.+/.test(url.trim());
  const canSubmit = urlOk && walkthrough.trim().length > 0 && allProbed && s.consented;

  const statusHint = s.submitting
    ? "Scoring your submission — this takes a few seconds."
    : !urlOk
      ? "Paste a link to your repository."
      : !walkthrough.trim()
        ? "Add a short walkthrough of your build."
        : !allProbed
          ? "Answer every question below."
          : !s.consented
            ? "Please consent above to submit."
            : "All set.";

  const onSubmit = () =>
    s.submit({ url: url.trim(), walkthrough, answers: probes.map((p) => ({ id: p.id, text: answers[p.id] ?? "" })) });

  return (
    <InterviewFrame
      phase="Take-home"
      title="Your take-home assignment"
      subtitle="Build it, link your repo, and walk us through your thinking. We care about how you reason and what you'd change — not perfect polish. Reviewed by a person."
    >
      {s.loading && <StatusCard body="Loading your assignment…" />}
      {!s.loading && s.error && <StatusCard tone="error" body={s.error} />}
      {!s.loading && s.notReady && (
        <StatusCard title="Your assignment isn't ready yet" body="The hiring team hasn't sent it yet. Check back shortly using the same link." />
      )}
      {!s.loading && s.submitted && (
        <StatusCard tone="success" title="Thanks — your submission is in." body="The hiring team will review it and follow up. You can close this tab." />
      )}

      {!s.loading && !s.error && !s.submitted && s.data && (
        <div className="space-y-6">
          <PromptCard label={`Assignment${s.data.assignment.timeboxHours ? ` · ~${s.data.assignment.timeboxHours}h` : ""}`}>
            {s.data.assignment.prompt}
          </PromptCard>

          <TextField label="Repository link" value={url} onChange={setUrl} placeholder="https://github.com/you/your-solution" type="url" />
          <LabeledTextarea
            label="Walkthrough — how you built it, key decisions, and trade-offs"
            value={walkthrough}
            onChange={setWalkthrough}
            rows={7}
            placeholder="Walk us through your approach, what you chose and rejected, and the riskiest part…"
          />

          {probes.map((p, i) => (
            <LabeledTextarea
              key={p.id}
              label={
                <span>
                  <span className="text-gray-500">{i + 1}. </span>
                  {p.prompt}
                </span>
              }
              value={answers[p.id] ?? ""}
              onChange={(v) => setAnswers((a) => ({ ...a, [p.id]: v }))}
              rows={5}
              placeholder="Your answer…"
            />
          ))}

          <Honeypot value={s.website} onChange={s.setWebsite} />
          <ConsentBlock consented={s.consented} onChange={s.setConsented} />
          <SubmitBar statusHint={statusHint} submitting={s.submitting} disabled={!canSubmit || s.submitting} onClick={onSubmit} label="Submit assignment" />
        </div>
      )}
    </InterviewFrame>
  );
}
