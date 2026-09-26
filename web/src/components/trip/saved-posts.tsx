import { ExternalLinkIcon, MapPinIcon } from "lucide-react";
import { formatTime, hostname } from "@/lib/format";
import type { SavedPost } from "@/lib/api/types";

export function SavedPosts({ saves }: { saves: SavedPost[] }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">Saved posts</h3>
      {saves.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing saved yet. Paste a post link below.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {saves.map((save) => (
            <li key={save.id} className="space-y-1 rounded-lg border p-3 text-sm">
              <div className="flex items-center gap-1.5 font-medium">
                <MapPinIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className={save.place_name ? "" : "text-muted-foreground"}>
                  {save.place_name ?? "Place not identified yet"}
                </span>
              </div>
              {save.note && <p className="text-pretty text-muted-foreground">{save.note}</p>}
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {save.source_url && (
                  <a
                    href={save.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline-offset-2 hover:underline focus-visible:underline"
                  >
                    {hostname(save.source_url)}
                    <ExternalLinkIcon className="size-3" aria-hidden />
                  </a>
                )}
                <span>Saved {formatTime(save.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
