import { cn } from "@/lib/utils";
import type { Message } from "@/lib/api/types";

export function Conversation({ messages }: { messages: Message[] }) {
  if (messages.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Conversation">
      <h3 className="text-sm font-medium">Conversation</h3>
      <ol className="space-y-2" aria-live="polite">
        {messages.map((m) => (
          <li key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <p
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap text-pretty",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              <span className="sr-only">{m.role === "user" ? "You: " : "Assistant: "}</span>
              {m.text}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
