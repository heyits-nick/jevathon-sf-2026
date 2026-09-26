import { PageShell } from "@/components/page-shell";
import { ScoreApp } from "@/components/score/score-app";

export default function Home() {
  return (
    <PageShell
      title="Menu Check"
      description="Diet tags on review sites are unreliable. We read the restaurant’s actual menu, have Jev judge every dish, and show you when we’re not sure."
    >
      <ScoreApp />
    </PageShell>
  );
}
