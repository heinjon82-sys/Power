import { describe, expect, it } from 'vitest'
import { generateKeyPair, SignJWT } from 'jose'
import { isSameOriginMutation, normalizeEmail, verifyAccessToken } from '../worker/auth'
import { clientRecord, ownsRow, serverOwnedRecord } from '../worker/tenancy'
import { identityLinkDecision } from '../worker/user-access'

const issuer = 'https://punttis.cloudflareaccess.com'
const audience = 'punttis-audience'

async function token(overrides: Record<string, unknown> = {}) {
  const keys = await generateKeyPair('RS256')
  const jwt = await new SignJWT({ email: 'User@Example.com', type: 'app', ...overrides })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject('access-user-1')
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(keys.privateKey)
  return { jwt, keys }
}

describe('Cloudflare Access -identiteetti', () => {
  it('validoi allekirjoituksen, issuerin ja audiencen ja normalisoi sähköpostin', async () => {
    const { jwt, keys } = await token()
    const identity = await verifyAccessToken(jwt, { teamDomain: issuer, audience }, async () => keys.publicKey)
    expect(identity).toMatchObject({ sub: 'access-user-1', emailNormalized: 'user@example.com' })
  })

  it('hylkää väärän audiencen', async () => {
    const { jwt, keys } = await token()
    await expect(verifyAccessToken(jwt, { teamDomain: issuer, audience: 'wrong' }, async () => keys.publicKey)).rejects.toThrow()
  })

  it('hylkää vanhentuneen tokenin', async () => {
    const keys = await generateKeyPair('RS256')
    const jwt = await new SignJWT({ email: 'user@example.com', type: 'app' })
      .setProtectedHeader({ alg: 'RS256' }).setSubject('user').setIssuer(issuer).setAudience(audience)
      .setIssuedAt(1).setExpirationTime(2).sign(keys.privateKey)
    await expect(verifyAccessToken(jwt, { teamDomain: issuer, audience }, async () => keys.publicKey)).rejects.toThrow()
  })

  it('estää risti-originista tulevan muutospyynnön', () => {
    expect(isSameOriginMutation(new Request('https://punttis.example/api/sync/push', { method: 'POST', headers: { origin: 'https://evil.example' } }))).toBe(false)
    expect(isSameOriginMutation(new Request('https://punttis.example/api/sync/push', { method: 'POST', headers: { origin: 'https://punttis.example' } }))).toBe(true)
    expect(normalizeEmail('  TEST@Example.COM ')).toBe('test@example.com')
  })
})

describe('käyttäjäeristys', () => {
  it('ylikirjoittaa selaimen lähettämän käyttäjätunnisteen palvelimen identiteetillä', () => {
    expect(serverOwnedRecord({ id: 'record', userId: 'attacker', user_id: 'attacker' }, 'server-user')).toEqual({ id: 'record', userId: 'server-user' })
  })

  it('ei hyväksy toisen käyttäjän riviä ja poistaa userId:n asiakasvastauksesta', () => {
    expect(ownsRow({ user_id: 'user-a' }, 'user-b')).toBe(false)
    expect(ownsRow({ user_id: 'user-a' }, 'user-a')).toBe(true)
    expect(clientRecord({ id: 'record', user_id: 'secret', userId: 'secret' })).toEqual({ id: 'record' })
  })

  it('aktivoi kutsun mutta estää estetyn tai eri identiteettiin sidotun tilin', () => {
    const identity = { sub: 'new-sub', emailNormalized: 'user@example.com' }
    expect(identityLinkDecision({ email_normalized: 'user@example.com', access_sub: null, status: 'invited' }, identity)).toBe('activate')
    expect(identityLinkDecision({ email_normalized: 'user@example.com', access_sub: null, status: 'disabled' }, identity)).toBe('disabled')
    expect(identityLinkDecision({ email_normalized: 'user@example.com', access_sub: 'old-sub', status: 'active' }, identity)).toBe('identity_relink_required')
    expect(identityLinkDecision({ email_normalized: 'other@example.com', access_sub: 'new-sub', status: 'active' }, identity)).toBe('email_mismatch')
  })
})
