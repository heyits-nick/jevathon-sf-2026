import { PageShell } from "@/components/page-shell";
import { TripApp } from "@/components/trip/trip-app";

export default function Home() {
  return (
    <PageShell
      title="Jev console"
      description="Inspect a stored trip: the evidence Jev used and every typed decision it recorded. iMessage and voice reach the same backend; iMessage conversations keep their own trip."
    >
      <TripApp />
    </PageShell>
  );
}
