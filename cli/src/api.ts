import { getAuthorizedBearer, NotLoggedInError } from '@openape/cli-auth'
import { ofetch, FetchError } from 'ofetch'
import { resolveEndpoint } from './config.ts'

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

function audForEndpoint(endpoint: string): string {
  try {
    return new URL(endpoint).host
  }
  catch {
    return 'tasks.openape.ai'
  }
}

/**
 * Call the tasks.openape.ai API with bearer auth. Auth is delegated to
 * `@openape/cli-auth.getAuthorizedBearer`, which:
 *   1. Returns a cached SP-token if still valid
 *   2. Otherwise refreshes the IdP token and exchanges it for a fresh SP
 *      token via `${endpoint}/api/cli/exchange`
 *
 * The user must have run `apes login` once on this device. ape-tasks no
 * longer manages its own login flow.
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
    try {
      headers.Authorization = await getAuthorizedBearer({
        endpoint,
        aud: audForEndpoint(endpoint),
      })
    }
    catch (err: unknown) {
      if (err instanceof NotLoggedInError) {
        throw createApiError(
          401,
          'Not logged in',
          `Run \`apes login <email>\` once on this device — ape-tasks now uses the unified apes session (endpoint: ${endpoint}).`,
        )
      }
      const e = err as { status?: number, title?: string, hint?: string, message?: string }
      throw createApiError(
        e.status ?? 0,
        e.title ?? e.message ?? 'Auth failed',
        e.hint,
      )
    }
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
