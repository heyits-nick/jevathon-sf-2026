import Link from "next/link";
import { SiteNav } from "./site-nav";

interface PageShellProps {
  /** Omit when the page renders its own heading (the console names the trip). */
  title?: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}

export function PageShell({ title, description, children }: PageShellProps) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b bg-sidebar/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:gap-8 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <span
              aria-hidden
              className="flex size-7 items-center justify-center rounded-lg bg-brand font-display text-base font-extrabold text-brand-foreground"
            >
              J
            </span>
            <span className="hidden font-display text-lg font-bold tracking-tight sm:inline">Jev console</span>
          </Link>
          <SiteNav />
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8 sm:py-10">
        {title && (
          <header className="mb-8 max-w-3xl space-y-2">
            <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
            {description && <p className="text-pretty text-muted-foreground sm:text-lg">{description}</p>}
          </header>
        )}
        {children}
      </main>
    </>
  );
}
