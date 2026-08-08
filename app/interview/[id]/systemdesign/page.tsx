"use client";

// Candidate-facing stage-4 system-design page (Phase 2). One free-text design response
// (the senior signal — no GitHub). Token-authed via ?t=<accessToken>. Shares the
// lifecycle hook + compliance chrome with the screen / take-home pages.

import { useState } from "react";
import { useParams } from "next/navigation";
import { useInterviewRound } from "@/app/interview/_shared/use-interview-round";
import {
  InterviewFrame,
  StatusCard,
  PromptCard,
  LabeledTextarea,
  Honeypot,
  ConsentBlock,
  SubmitBar,
} from "@/app/interview/_shared/interview-ui";

type SystemDesignData = { prompt: string };

function parseSystemDesign(json: unknown): SystemDesignData {
  const j = (json ?? {}) as Partial<SystemDesignData>;
  return { prompt: typeof j.prompt === "string" ? j.prompt : "" };
}

export default function SystemDesignPage() {
  const id = (useParams()?.id as string) || "";
  const s = useInterviewRound<SystemDesignData>(id, "/api/interview/systemdesign", parseSystemDesign);
  const [response, setResponse] = useState("");

  const enough = response.trim().length >= 80;
  const canSubmit = enough && s.consented;
  const statusHint = s.submitting
    ? "Scoring your response — this takes a few seconds."
    : !enough
      ? "Sketch your design in the box above."
      : !s.consented
        ? "Please consent above to submit."
        : "All set.";

  return (
    <InterviewFrame
      phase="System design"
      title="System design exercise"
      subtitle="Think out loud in writing: clarify requirements, sketch the architecture, and justify your trade-offs. There's no single right answer — we're reading your reasoning. Reviewed by a person."
    >
      {s.loading && <StatusCard body="Loading your exercise…" />}
      {!s.loading && s.error && <StatusCard tone="error" body={s.error} />}
      {!s.loading && s.notReady && (
        <StatusCard title="Your exercise isn't ready yet" body="The hiring team hasn't sent it yet. Check back shortly using the same link." />
      )}
      {!s.loading && s.submitted && (
        <StatusCard tone="success" title="Thanks — your response is in." body="The hiring team will review it and follow up. You can close this tab." />
      )}

      {!s.loading && !s.error && !s.submitted && s.data && (
        <div className="space-y-6">
          <PromptCard label="Scenario">{s.data.prompt}</PromptCard>
          <LabeledTextarea
            label="Your design"
            value={response}
            onChange={setResponse}
            rows={16}
            placeholder="Requirements (functional + non-functional), high-level architecture, data model, key trade-offs, and how you'd scale and operate it…"
          />
          <Honeypot value={s.website} onChange={s.setWebsite} />
          <ConsentBlock consented={s.consented} onChange={s.setConsented} />
          <SubmitBar
            statusHint={statusHint}
            submitting={s.submitting}
            disabled={!canSubmit || s.submitting}
            onClick={() => s.submit({ response })}
            label="Submit design"
          />
        </div>
      )}
    </InterviewFrame>
  );
}
