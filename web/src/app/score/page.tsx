import { PageShell } from "@/components/page-shell";
import { ScoreApp } from "@/components/score/score-app";

export default function ScorePage() {
  return (
    <PageShell
      title="Check a menu"
      description="Presenter tool. Score one restaurant through the live POST /score path if the trip flow is still integrating."
    >
      <ScoreApp />
    </PageShell>
  );
}
