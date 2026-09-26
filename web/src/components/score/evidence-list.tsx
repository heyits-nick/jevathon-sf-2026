import { ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EVIDENCE_KIND_LABEL } from "@/lib/score/config";
import { formatTime, hostname } from "@/lib/format";
import type { Evidence } from "@/lib/api/types";

export function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (evidence.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Sources</h3>
        <p className="text-xs text-muted-foreground">
          Quotes the server checked. A quote is context, not proof that an ingredient is absent.
        </p>
      </div>
      <ul className="space-y-2">
        {evidence.map((e) => (
          <li key={e.id} className="rounded-lg border p-3 text-sm">
            <blockquote className="text-pretty">&ldquo;{e.quote}&rdquo;</blockquote>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{EVIDENCE_KIND_LABEL[e.kind] ?? e.kind}</Badge>
              <a
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline-offset-2 hover:underline focus-visible:underline"
              >
                {hostname(e.url)}
                <ExternalLinkIcon className="size-3" aria-hidden />
              </a>
              <span>Checked {formatTime(e.checked_at)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
