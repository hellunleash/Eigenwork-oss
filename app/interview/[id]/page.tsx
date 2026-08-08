"use client";

// Candidate-facing stage-3 screen (Phase 2). One generic, data-driven page: it renders
// whatever questions the plan produced. Token-authed via ?t=<accessToken>. Shares the
// lifecycle hook + compliance chrome with the take-home / system-design pages.

import { useState } from "react";
import { useParams } from "next/navigation";
import { useInterviewRound } from "@/app/interview/_shared/use-interview-round";
import {
  InterviewFrame,
  StatusCard,
  LabeledTextarea,
  Honeypot,
  ConsentBlock,
  SubmitBar,
} from "@/app/interview/_shared/interview-ui";

type Question = { id: string; kind: "code" | "probe"; prompt: string };
type ScreenData = { questions: Question[] };

function parseScreen(json: unknown): ScreenData {
  const j = (json ?? {}) as Partial<ScreenData>;
  return { questions: Array.isArray(j.questions) ? j.questions : [] };
}

export default function InterviewScreenPage() {
  const id = (useParams()?.id as string) || "";
  const s = useInterviewRound<ScreenData>(id, "/api/interview/screen", parseScreen);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const questions = s.data?.questions ?? [];
  const allAnswered = questions.length > 0 && questions.every((q) => (answers[q.id] ?? "").trim().length > 0);
  const canSubmit = allAnswered && s.consented;
  const statusHint = s.submitting
    ? "Scoring your answers — this takes a few seconds."
    : !allAnswered
      ? "Answer every question to submit."
      : !s.consented
        ? "Please consent above to submit."
        : "All set.";

  return (
    <InterviewFrame
      phase="Technical screen"
      title="A few questions about your work"
      subtitle="Answer in your own words — we care more about your reasoning than perfect syntax. This is reviewed by a person."
    >
      {s.loading && <StatusCard body="Loading your screen…" />}
      {!s.loading && s.error && <StatusCard tone="error" body={s.error} />}
      {!s.loading && s.notReady && (
        <StatusCard title="Your screen isn't ready yet" body="The hiring team hasn't sent your questions yet. Check back shortly using the same link." />
      )}
      {!s.loading && s.submitted && (
        <StatusCard tone="success" title="Thanks — your answers are in." body="The hiring team will review your screen and follow up. You can close this tab." />
      )}

      {!s.loading && !s.error && !s.submitted && questions.length > 0 && (
        <div className="space-y-6">
          {questions.map((q, i) => (
            <LabeledTextarea
              key={q.id}
              label={
                <span className="block">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
                    {i + 1} · {q.kind === "code" ? "Coding" : "Experience"}
                  </span>
                  <span className="mt-1.5 block text-gray-200">{q.prompt}</span>
                </span>
              }
              value={answers[q.id] ?? ""}
              onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
              rows={6}
              placeholder="Your answer…"
            />
          ))}
          <Honeypot value={s.website} onChange={s.setWebsite} />
          <ConsentBlock consented={s.consented} onChange={s.setConsented} />
          <SubmitBar
            statusHint={statusHint}
            submitting={s.submitting}
            disabled={!canSubmit || s.submitting}
            onClick={() => s.submit({ answers: questions.map((q) => ({ id: q.id, text: answers[q.id] ?? "" })) })}
            label="Submit answers"
          />
        </div>
      )}
    </InterviewFrame>
  );
}
