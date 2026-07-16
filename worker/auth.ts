import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTVerifyOptions } from 'jose'

export type AccessIdentity = {
  sub: string
  email: string
  emailNormalized: string
  loginMethod: string
}

export type AccessConfig = {
  teamDomain: string
  audience: string
}

export function normalizeEmail(value: string) {
  return value.trim().toLocaleLowerCase('en-US')
}

function loginMethod(payload: Record<string, unknown>) {
  const custom = payload.custom
  if (custom && typeof custom === 'object') {
    const source = custom as Record<string, unknown>
    const candidate = source.idp ?? source.provider ?? source.login_method
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return 'Cloudflare Access'
}

export async function verifyAccessToken(
  token: string,
  config: AccessConfig,
  key?: JWTVerifyGetKey | CryptoKey
): Promise<AccessIdentity> {
  if (!config.teamDomain || !config.audience) throw new Error('Access configuration is incomplete')
  const issuer = config.teamDomain.replace(/\/$/, '')
  const verifyKey = key ?? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`))
  const options: JWTVerifyOptions = { issuer, audience: config.audience, algorithms: ['RS256'] }
  const { payload } = typeof verifyKey === 'function'
    ? await jwtVerify(token, verifyKey, options)
    : await jwtVerify(token, verifyKey, options)
  if (payload.type !== 'app' || typeof payload.sub !== 'string' || !payload.sub) throw new Error('Invalid Access identity')
  if (typeof payload.email !== 'string' || !payload.email.includes('@')) throw new Error('Missing verified email')
  return {
    sub: payload.sub,
    email: payload.email,
    emailNormalized: normalizeEmail(payload.email),
    loginMethod: loginMethod(payload as Record<string, unknown>)
  }
}

export function isSameOriginMutation(request: Request) {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return true
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return false
  const fetchSite = request.headers.get('sec-fetch-site')
  return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none'
}
