import { NextResponse } from "next/server";

export const maxDuration = 60;

const TIMEOUT_MS = 55_000;

/** Only the documented contract paths are forwarded; this is not an open proxy. */
const ALLOWED_PATHS = [/^score$/, /^trips$/, /^trips\/[^/]+$/, /^trips\/[^/]+\/messages$/];

type RouteContext = { params: Promise<{ path: string[] }> };

const errorResponse = (status: number, code: string, message: string, retryable: boolean) =>
  NextResponse.json({ error: { code, message, retryable } }, { status });

async function forward(req: Request, { params }: RouteContext) {
  const path = (await params).path.map(encodeURIComponent).join("/");
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(path))) {
    return errorResponse(404, "NOT_FOUND", "Unknown API path.", false);
  }

  const baseUrl = process.env.BACKEND_API_URL;
  if (!baseUrl) {
    return errorResponse(503, "BACKEND_NOT_CONFIGURED", "BACKEND_API_URL is not set for the web app.", false);
  }

  const authorization = req.headers.get("authorization");
  try {
    const upstream = await fetch(new URL(`/${path}`, baseUrl), {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: req.method === "GET" ? undefined : await req.text(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    return timedOut
      ? errorResponse(504, "TIMEOUT", "The server took too long to respond. Try again.", true)
      : errorResponse(502, "BACKEND_UNREACHABLE", "Could not reach the server. Try again.", true);
  }
}

export { forward as GET, forward as POST };
