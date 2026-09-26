import { CheckCircle2Icon, CircleAlertIcon, CircleHelpIcon, Loader2Icon, BookmarkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TripStatus } from "@/lib/api/types";

const STATUS: Record<TripStatus, { label: string; icon: typeof BookmarkIcon; className: string }> = {
  saved: { label: "Saved", icon: BookmarkIcon, className: "bg-secondary text-secondary-foreground" },
  needs_clarification: { label: "Needs your input", icon: CircleHelpIcon, className: "bg-warning/10 text-warning" },
  researching: { label: "Researching", icon: Loader2Icon, className: "bg-primary/10 text-foreground" },
  ready: { label: "Ready", icon: CheckCircle2Icon, className: "bg-success/10 text-success" },
  failed: { label: "Research failed", icon: CircleAlertIcon, className: "bg-destructive/10 text-destructive" },
};

export function TripStatusBadge({ status }: { status: TripStatus }) {
  const { label, icon: Icon, className } = STATUS[status] ?? STATUS.saved;
  return (
    <Badge variant="outline" className={cn("border-transparent", className)}>
      <Icon data-icon="inline-start" className={cn(status === "researching" && "animate-spin")} />
      {label}
    </Badge>
  );
}
