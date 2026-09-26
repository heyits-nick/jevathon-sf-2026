import { PageShell } from "@/components/page-shell";
import { TripApp } from "@/components/trip/trip-app";

export default function Home() {
  return (
    <PageShell
      title="Where should we eat?"
      description="Save the posts that inspired you, tell us your diet, and we’ll read the real menus and show you what fits, with sources and honest uncertainty."
    >
      <TripApp />
    </PageShell>
  );
}
