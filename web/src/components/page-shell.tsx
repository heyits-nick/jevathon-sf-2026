interface PageShellProps {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}

export function PageShell({ title, description, children }: PageShellProps) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-16">
      <header className="mb-8 space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-pretty text-muted-foreground">{description}</p>
      </header>
      {children}
    </main>
  );
}
