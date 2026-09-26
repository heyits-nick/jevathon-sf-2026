import type {
  ApiErrorBody,
  CreateTripRequest,
  CreateTripResponse,
  ScoreRequest,
  ScoreResponse,
  Trip,
  TripMessageRequest,
  TripMessageResponse,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const isErrorBody = (body: unknown): body is ApiErrorBody =>
  typeof body === "object" && body !== null && "error" in body && typeof (body as ApiErrorBody).error?.message === "string";

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api/backend${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch {
    throw new ApiError("Network error. Check your connection and try again.", 0, "NETWORK", true);
  }

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (isErrorBody(body)) {
      throw new ApiError(body.error.message, res.status, body.error.code, body.error.retryable);
    }
    throw new ApiError(`Request failed (HTTP ${res.status}).`, res.status, "HTTP_ERROR", res.status >= 500);
  }
  return body as T;
}

const post = <T>(path: string, body: unknown, token?: string) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body), token });

export const api = {
  score: (req: ScoreRequest) => post<ScoreResponse>("/score", req),
  createTrip: (req: CreateTripRequest) => post<CreateTripResponse>("/trips", req),
  getTrip: (tripId: string, token: string) =>
    request<Trip>(`/trips/${encodeURIComponent(tripId)}`, { token }),
  sendMessage: (tripId: string, token: string, req: TripMessageRequest) =>
    post<TripMessageResponse>(`/trips/${encodeURIComponent(tripId)}/messages`, req, token),
};
