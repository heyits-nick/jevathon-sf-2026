import Link from "next/link";

const NAV = [
  { href: "/", label: "Trip" },
  { href: "/score", label: "Check a menu" },
];

interface PageShellProps {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}

export function PageShell({ title, description, children }: PageShellProps) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:py-12">
      <nav aria-label="Main" className="mb-8 flex gap-4 text-sm">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:text-foreground"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <header className="mb-8 space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-pretty text-muted-foreground">{description}</p>
      </header>
      {children}
    </main>
  );
}
