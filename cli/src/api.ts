import { ofetch, FetchError } from 'ofetch'
import { getActiveSession, resolveEndpoint } from './config.ts'

export interface ApiError extends Error {
  status: number
  title: string
  detail?: string
}

function createApiError(status: number, title: string, detail?: string): ApiError {
  // citty surfaces only `error.message` on rejection, so we fold `detail` in
  // when present — otherwise the extra hint is never shown to the user.
  const message = detail ? `${title}\n${detail}` : title
  const err = new Error(message) as ApiError
  err.status = status
  err.title = title
  err.detail = detail
  return err
}

/**
 * Call the tasks.openape.ai API with bearer auth. Resolves endpoint from CLI
 * state; overridable via `--endpoint <url>`. Throws ApiError with RFC-7807-ish
 * shape on non-2xx. Requires an active session unless `opts.auth === false`.
 */
export async function apiCall<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  opts: {
    body?: unknown
    query?: Record<string, string | number | boolean | undefined>
    endpoint?: unknown
    auth?: boolean
  } = {},
): Promise<T> {
  const endpoint = resolveEndpoint(opts.endpoint)
  const headers: Record<string, string> = { Accept: 'application/json' }

  if (opts.auth !== false) {
    const session = getActiveSession(opts.endpoint)
    if (!session) {
      throw createApiError(
        401,
        'Not logged in',
        `Run \`ape-tasks login <email>\` first (endpoint: ${endpoint}).`,
      )
    }
    headers.Authorization = `Bearer ${session.token}`
  }

  try {
    return await ofetch<T>(`${endpoint}${path}`, {
      method,
      headers,
      body: opts.body as Record<string, unknown> | undefined,
      query: opts.query,
    })
  }
  catch (err: unknown) {
    if (err instanceof FetchError) {
      const status = err.response?.status ?? 0
      const data = err.data as { title?: string, detail?: string } | undefined
      throw createApiError(
        status,
        data?.title ?? err.response?.statusText ?? err.message,
        data?.detail,
      )
    }
    throw err
  }
}

export { createApiError }
