import type { Metadata } from "next";
import { DraftLanding } from "./DraftLanding";

// Preview-only route — never index the draft.
export const metadata: Metadata = {
  title: "EigenWork — homepage draft (preview)",
  robots: { index: false, follow: false },
};

export default function HomeV2DraftPreview() {
  return <DraftLanding />;
}
