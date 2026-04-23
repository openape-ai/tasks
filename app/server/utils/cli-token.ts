import { SignJWT, jwtVerify } from 'jose'
import { useRuntimeConfig } from 'nitropack/runtime'

export interface CliTokenPayload {
  iss: 'tasks.openape.ai'
  typ: 'cli'
  sub: string
  email: string
  act: 'human' | 'agent'
  iat: number
  exp: number
}

function secret(): Uint8Array {
  const s = useRuntimeConfig().cliTokenSecret as string
  if (!s || s.length < 32) throw new Error('cliTokenSecret must be at least 32 chars')
  return new TextEncoder().encode(s)
}

export async function signCliToken(params: {
  email: string
  act: 'human' | 'agent'
  ttlSeconds?: number
}): Promise<{ token: string, expiresAt: number }> {
  const ttl = params.ttlSeconds ?? 30 * 24 * 3600
  const now = Math.floor(Date.now() / 1000)
  const exp = now + ttl
  const payload = { typ: 'cli', sub: params.email, email: params.email, act: params.act }
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('tasks.openape.ai')
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret())
  return { token, expiresAt: exp }
}

export async function verifyCliToken(token: string): Promise<CliTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: 'tasks.openape.ai' })
    if (payload.typ !== 'cli') return null
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null
    if (payload.act !== 'human' && payload.act !== 'agent') return null
    return payload as unknown as CliTokenPayload
  }
  catch {
    return null
  }
}
