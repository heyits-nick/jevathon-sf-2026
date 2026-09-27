"use client";

import { useState, type FormEvent } from "react";
import { Loader2Icon, SendIcon } from "lucide-react";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { MessagePayload, UseTrip } from "@/hooks/use-trip";
import { InlineError } from "./inline-error";

interface TripComposerProps {
  pending: UseTrip["pending"];
  onSend: (payload: MessagePayload) => Promise<boolean>;
  onRetry: () => Promise<boolean>;
  clarification: string | null;
  /** Mounting point for the voice control supplied by the integrations owner. */
  voiceSlot?: React.ReactNode;
}

export function TripComposer({ pending, onSend, onRetry, clarification, voiceSlot }: TripComposerProps) {
  const [text, setText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const sending = pending?.status === "sending";
  const canSend = text.trim() !== "" || sourceUrl.trim() !== "";

  const clearOnSuccess = (ok: boolean) => {
    if (!ok) return;
    setText("");
    setSourceUrl("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearOnSuccess(
      await onSend({
        text: text.trim(),
        ...(sourceUrl.trim() && { source_url: sourceUrl.trim() }),
      }),
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field id="message" label={clarification ? "Your answer" : "Message"}>
        <Textarea
          id="message"
          placeholder={clarification ? "Answer the question above" : "Ask what Jev found, or set aside a place"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
      <Field id="source-url" label="Post link (optional)" hint="A public Instagram, TikTok, or blog link you saved.">
        <Input
          id="source-url"
          type="url"
          placeholder="https://www.instagram.com/p/…"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" className="flex-1" disabled={sending || !canSend}>
          {sending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
          {sending ? "Sending…" : "Send"}
        </Button>
        {voiceSlot}
      </div>
      {pending?.status === "failed" && (
        <InlineError message={pending.error ?? "Message failed."} onRetry={() => onRetry().then(clearOnSuccess)} />
      )}
    </form>
  );
}
