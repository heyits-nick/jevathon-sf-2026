import { notFound } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { SampleDataBanner } from "@/components/sample-data-banner";
import { ScoreResult } from "@/components/score/score-result";
import { Card, CardContent } from "@/components/ui/card";
import { SAMPLE_SCORE } from "@/lib/fixtures/score";

export default function SamplePage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <PageShell title="Sample layouts" description="Development-only preview of result components.">
      <div className="space-y-6">
        <SampleDataBanner />
        <Card>
          <CardContent>
            <ScoreResult result={SAMPLE_SCORE} />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
