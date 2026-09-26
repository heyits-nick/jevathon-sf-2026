import { ApiError } from "./client";

const FRIENDLY_MESSAGES: Record<string, string> = {
  NO_MENU_EVIDENCE: "No dishes could be read from that menu page. It may be a PDF or image menu; try another URL.",
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return FRIENDLY_MESSAGES[err.code] ?? err.message;
  return err instanceof Error ? err.message : "Something went wrong.";
}
