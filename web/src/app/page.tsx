import { PageShell } from "@/components/page-shell";
import { TripApp } from "@/components/trip/trip-app";

export default function Home() {
  return (
    <PageShell
      title="Jev console"
      description="iMessage is the traveler’s path. This page is the inspector: the same stored trip, the evidence Jev used, and every typed decision it recorded."
    >
      <TripApp />
    </PageShell>
  );
}
