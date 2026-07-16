import { useEffect, useState } from 'react'
import { Check, Copy, Trash2, UserPlus, Users } from 'lucide-react'
import type { AppUser } from '../types'
import { deleteUser, disableUser, inviteUser, listUsers, updateUser } from '../lib/auth'
import { Glass, KebabMenu, Modal } from './ui'

const statusLabel: Record<AppUser['status'], string> = {
  invited: 'Odottaa kirjautumista', active: 'Aktiivinen', disabled: 'Estetty'
}

export function UserManagement({ currentUser, onDismiss }: { currentUser: AppUser; onDismiss: () => void }) {
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [deleteCandidate, setDeleteCandidate] = useState<AppUser>()

  const refresh = async () => {
    setLoading(true)
    try { setUsers(await listUsers()); setError('') }
    catch { setError('Käyttäjälistaa ei voitu ladata.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])

  const invite = async () => {
    if (!email.includes('@')) { setError('Anna kelvollinen sähköpostiosoite.'); return }
    try {
      await inviteUser(email, name)
      setEmail(''); setName(''); setError(''); await refresh()
    } catch { setError('Sähköposti on jo käytössä tai kutsua ei voitu tallentaa.') }
  }
  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.origin)
    setCopied(true); window.setTimeout(() => setCopied(false), 1800)
  }
  const modify = async (user: AppUser, changes: Parameters<typeof updateUser>[1]) => {
    try { await updateUser(user.id, changes); await refresh() }
    catch { setError('Käyttäjää ei voitu päivittää.') }
  }
  const remove = async () => {
    if (!deleteCandidate) return
    try { await deleteUser(deleteCandidate.id); setDeleteCandidate(undefined); await refresh() }
    catch { setError('Käyttäjää ei voitu poistaa.') }
  }

  return <Modal title="Käyttäjät" top onDismiss={onDismiss} className="user-management">
    <Glass className="invite-card">
      <div className="section-header"><div><p className="eyebrow">UUSI KUTSU</p><h3>Hyväksy sähköposti</h3></div><UserPlus size={22}/></div>
      <label><span>Nimi <small>valinnainen</small></span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Etunimi" /></label>
      <label><span>Sähköposti</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nimi@example.com" autoCapitalize="none" /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="primary-button wide" onClick={() => void invite()}><UserPlus size={18}/> Lisää käyttäjä</button>
      <button className="surface-button wide" onClick={() => void copyLink()}>{copied ? <Check size={18}/> : <Copy size={18}/>} {copied ? 'Linkki kopioitu' : 'Kopioi sovelluslinkki'}</button>
      <p className="invite-help">Jaa linkki kutsutulle. Hän kirjautuu samalla hyväksytyllä osoitteella Googlella tai sähköpostikoodilla.</p>
    </Glass>
    <div className="user-list-heading"><Users size={18}/><strong>{users.length} käyttäjää</strong></div>
    {loading ? <Glass className="empty"><p>Ladataan käyttäjiä…</p></Glass> : <div className="user-list">{users.map((user) => <Glass className="user-card" key={user.id}>
      <div className="user-avatar">{(user.displayName || user.email).slice(0, 1).toLocaleUpperCase('fi-FI')}</div>
      <div className="user-copy"><strong>{user.displayName || user.email.split('@')[0]}</strong><small>{user.email}</small><span className={`user-status ${user.status}`}>{statusLabel[user.status]}</span></div>
      {user.role === 'owner' ? <span className="owner-badge">Omistaja</span> : <KebabMenu label={`${user.email} toiminnot`} items={[
        user.status === 'disabled'
          ? { label: 'Salli käyttäjä', action: () => void modify(user, { status: 'active' }) }
          : { label: 'Estä käyttäjä', action: () => void disableUser(user.id).then(refresh).catch(() => setError('Käyttäjää ei voitu estää.')), danger: true },
        { label: 'Nollaa kirjautumissidos', action: () => void modify(user, { resetIdentity: true }), disabled: !user.identityLinked },
        { label: 'Poista käyttäjä ja data', action: () => setDeleteCandidate(user), danger: true }
      ]}/>} 
    </Glass>)}</div>}
    <p className="privacy-note">Näet vain tilien tilan. Muiden treeni- ja mittaustietoja ei näytetä omistajalle.</p>
    {deleteCandidate && <Modal title="Poista käyttäjä?" onDismiss={() => setDeleteCandidate(undefined)}>
      <div className="confirm-copy"><Trash2 size={28}/><p><strong>{deleteCandidate.email}</strong> ja kaikki hänen palvelimelle synkronoidut treeni- ja mittaustietonsa poistetaan pysyvästi.</p></div>
      <button className="danger-button wide" onClick={() => void remove()}><Trash2 size={18}/> Poista käyttäjä ja data</button>
    </Modal>}
  </Modal>
}
