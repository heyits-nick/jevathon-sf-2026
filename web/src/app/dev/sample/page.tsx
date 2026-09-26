import { notFound } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { SampleDataBanner } from "@/components/sample-data-banner";
import { SampleTripPreview } from "@/components/trip/sample-trip-preview";

export default function SamplePage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <PageShell title="Sample layouts" description="Development-only preview of trip and result components.">
      <div className="space-y-6">
        <SampleDataBanner />
        <SampleTripPreview />
      </div>
    </PageShell>
  );
}
