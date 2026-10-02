"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/api/types";

export function Conversation({ messages }: { messages: Message[] }) {
  const list = useRef<HTMLOListElement>(null);
  const last = messages.at(-1)?.id;

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [last]);

  // The live region stays mounted while empty so the first reply is announced.
  return (
    <>
      {messages.length === 0 && (
        <p className="text-sm text-muted-foreground">No messages yet. Share a post link or ask a question below.</p>
      )}
      <ol ref={list} className="-mx-1 flex max-h-[26rem] flex-col gap-2 overflow-y-auto px-1" aria-live="polite" aria-label="Conversation">
      {messages.map((m) => (
        <li key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
          <p
            className={cn(
              "max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-pretty [overflow-wrap:anywhere]",
              m.role === "user"
                ? "rounded-2xl rounded-br-md bg-primary text-primary-foreground"
                : "rounded-2xl rounded-bl-md bg-muted",
            )}
          >
            <span className="sr-only">{m.role === "user" ? "You: " : "Assistant: "}</span>
            {m.text || <span className="italic opacity-70">No message text</span>}
          </p>
        </li>
      ))}
      </ol>
    </>
  );
}
