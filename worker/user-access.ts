export type LinkableUser = {
  email_normalized: string
  access_sub: string | null
  status: 'invited' | 'active' | 'disabled'
}

export type IdentityLinkDecision = 'linked' | 'activate' | 'disabled' | 'identity_relink_required' | 'email_mismatch'

export function identityLinkDecision(user: LinkableUser, identity: { sub: string; emailNormalized: string }): IdentityLinkDecision {
  if (user.status === 'disabled') return 'disabled'
  if (user.email_normalized !== identity.emailNormalized) return 'email_mismatch'
  if (!user.access_sub) return 'activate'
  if (user.access_sub !== identity.sub) return 'identity_relink_required'
  return 'linked'
}
