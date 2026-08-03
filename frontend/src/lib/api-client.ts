import { getAccessToken } from "@/lib/supabase";
import { requestWithAuthRefreshRetry } from "@/lib/request-recovery";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export type ApiErrorResponse = {
  detail?: unknown;
};

// Carries the backend status so callers can distinguish retryable failures from
// ordinary validation errors without duplicating response parsing.
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Adds the current Supabase session when one exists. The backend remains the
// authority on whether a route requires authentication.
export async function authHeaders(
  forceRefresh = false,
): Promise<Record<string, string>> {
  const token = await getAccessToken(forceRefresh);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Sends an authenticated request and repairs one stale-session failure. This is
// intentionally bounded to one refresh + replay: callers never loop on a 401,
// and POST users must be idempotent (saved projects upsert by repository URL).
export async function fetchWithAuthRetry(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const send = async (authorization: Record<string, string>) => {
    const headers = new Headers(init.headers);
    const token = authorization.Authorization;
    if (token) {
      headers.set("Authorization", token);
    } else {
      headers.delete("Authorization");
    }
    return fetch(input, { ...init, headers });
  };

  return requestWithAuthRefreshRetry(
    async (token) =>
      send(token ? { Authorization: `Bearer ${token}` } : {}),
    (forceRefresh) => getAccessToken(forceRefresh),
  );
}

// Prefers FastAPI's explicit detail string and otherwise preserves a
// caller-specific fallback for malformed or empty error bodies.
export function getApiErrorMessage(
  errorBody: ApiErrorResponse,
  fallbackMessage: string,
): string {
  return typeof errorBody.detail === "string"
    ? errorBody.detail
    : fallbackMessage;
}

// Converts a failed response into the shared typed error. Kept separate from
// JSON success parsing so 204 responses can reuse the same error behavior.
export async function throwResponseError(
  response: Response,
  fallbackMessage: string,
): Promise<never> {
  const errorBody = (await response
    .json()
    .catch(() => ({}))) as ApiErrorResponse;
  throw new ApiError(
    getApiErrorMessage(errorBody, fallbackMessage),
    response.status,
  );
}

// Parses a successful JSON response and applies the shared FastAPI error rules.
export async function parseJsonResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  if (!response.ok) {
    return throwResponseError(response, fallbackMessage);
  }
  return (await response.json()) as T;
}
