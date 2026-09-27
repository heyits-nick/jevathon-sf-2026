import { ExternalLinkIcon, MapPinIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime, hostname } from "@/lib/format";
import type { SavedPost } from "@/lib/api/types";

export function SavedPosts({ saves }: { saves: SavedPost[] }) {
  return (
    <section className="space-y-3" aria-labelledby="saved-posts-heading">
      <h2 id="saved-posts-heading" className="sr-only">
        Saved posts
      </h2>
      {saves.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-3.5 text-sm text-muted-foreground">
          Nothing saved yet. Share a post link in the conversation.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {saves.map((save) => (
            <li key={save.id} className="flex items-start gap-3.5 rounded-2xl border bg-card p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/20 text-warning">
                <MapPinIcon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 space-y-1 text-sm">
                <p className="text-[0.7rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                  {save.place_name ? "Saved post · place from caption" : "Saved post"}
                </p>
                <p className={cn("text-base font-semibold", !save.place_name && "font-normal text-muted-foreground")}>
                  {save.place_name ?? "Place not identified yet"}
                </p>
                {save.note && <p className="text-pretty text-muted-foreground">{save.note}</p>}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {save.source_url && (
                    <a
                      href={save.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline focus-visible:underline"
                    >
                      {hostname(save.source_url)}
                      <ExternalLinkIcon className="size-3" aria-hidden />
                    </a>
                  )}
                  <span>Saved {formatTime(save.created_at)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
