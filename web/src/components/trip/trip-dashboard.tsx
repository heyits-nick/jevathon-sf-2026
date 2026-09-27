interface TripDashboardProps {
  header: React.ReactNode;
  main: React.ReactNode;
  rail: React.ReactNode;
}

/** Trip header across the top; results in the main column; Jev trace and conversation in the rail. */
export function TripDashboard({ header, main, rail }: TripDashboardProps) {
  return (
    <div className="space-y-8 sm:space-y-10">
      {header}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px] xl:gap-10">
        <div className="min-w-0 space-y-8">{main}</div>
        <aside aria-label="Jev decisions and conversation" className="min-w-0 space-y-6">
          {rail}
        </aside>
      </div>
    </div>
  );
}
