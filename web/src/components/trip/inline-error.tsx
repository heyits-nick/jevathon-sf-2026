import { AlertCircleIcon, RotateCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InlineErrorProps {
  message: string;
  onRetry?: () => void;
}

export function InlineError({ message, onRetry }: InlineErrorProps) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
      <AlertCircleIcon className="size-4 shrink-0" />
      <span>{message}</span>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RotateCwIcon />
          Retry
        </Button>
      )}
    </div>
  );
}
