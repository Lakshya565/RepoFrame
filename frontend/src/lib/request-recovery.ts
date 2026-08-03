// Pure recovery policies shared by authenticated History requests and autosave.
// Keeping the decisions free of browser/Supabase dependencies makes their retry
// bounds directly testable without a live session or hosted service.

export async function requestWithAuthRefreshRetry(
  send: (token: string | null) => Promise<Response>,
  getToken: (forceRefresh: boolean) => Promise<string | null>,
): Promise<Response> {
  const response = await send(await getToken(false));
  if (response.status !== 401) {
    return response;
  }

  const refreshedToken = await getToken(true);
  return refreshedToken ? send(refreshedToken) : response;
}

export function isRetryablePersistenceStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}
