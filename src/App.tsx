import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Download, Dumbbell, History, LogOut, Play, Plus, RefreshCw, Scale, ShieldCheck, Trash2, Users, WifiOff, X } from 'lucide-react'
import { exercises } from './data/exercises'
import { getDb, initializeUserDatabase } from './lib/db'
import { createSessionFromTemplate, emptySnapshot, loadSnapshot, mutate, softDeleteTemplate, type Snapshot } from './lib/data'
import { bootstrapExercises, syncChanges } from './lib/sync'
import { elapsed, now, time } from './lib/utils'
import type { WorkoutSession, WorkoutTemplate } from './types'
import { HistoryView } from './components/HistoryView'
import { MeasurementsView } from './components/MeasurementsView'
import { ProgramEditor } from './components/ProgramEditor'
import { CompactWorkoutDock, WorkoutView, type WorkoutSummary } from './components/WorkoutView'
import { ExerciseAvatar, Glass, KebabMenu, Modal, PullHint } from './components/ui'
import { AccountAccessError, currentUser, logout } from './lib/auth'
import type { AppUser } from './types'
import { UserManagement } from './components/UserManagement'

type Tab = 'programs' | 'history' | 'measurements'
type SyncState = 'local' | 'syncing' | 'synced' | 'offline' | 'conflict'

const tabTitle: Record<Tab, string> = { programs: 'Ohjelmat', history: 'Historia', measurements: 'Mitat' }

function Programs({ snapshot, onStart, onCreate, onEdit, onDelete }: {
  snapshot: Snapshot
  onStart: (template: WorkoutTemplate) => void
  onCreate: () => void
  onEdit: (template: WorkoutTemplate) => void
  onDelete: (template: WorkoutTemplate) => void
}) {
  return <div className="content programs-view">
    <Glass className="hero" as="section"><div><div className="hero-logo">
  <img src="/pwa-192.svg" alt="Power" />
  <span>POWER</span>
</div><h2>Treeni päivä.<br/><em>Pidä Flow.</em></h2><p>Voimaa joka päivä.</p></div><Activity className="hero-icon"/></Glass>
    <div className="section-header"><div><p className="eyebrow">TREENIPOHJAT</p><h2>Ohjelmasi</h2></div><button className="surface-button compact" onClick={onCreate}><Plus size={18}/> Uusi</button></div>
    {!snapshot.templates.length ? <Glass className="empty"><Dumbbell size={32}/><h3>Ensimmäinen ohjelma</h3><p>Luo ohjelma liikepankin kaikista 69 liikkeestä ja aloita treeni yhdellä painalluksella.</p><button className="primary-button" onClick={onCreate}><Plus size={18}/> Luo ohjelma</button></Glass> : <div className="program-list">{snapshot.templates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((template) => {
      const children = snapshot.templateExercises.filter((item) => item.templateId === template.id).sort((a, b) => a.orderIndex - b.orderIndex)
      const infos = children.flatMap((item) => {
        const exercise = snapshot.exercises.find((candidate) => candidate.id === item.exerciseId)
        return exercise ? [exercise] : []
      })
      return <Glass className="program-card" as="article" key={template.id}>
        <header><div className="avatar-stack">{infos.slice(0, 3).map((exercise) => <ExerciseAvatar key={exercise.id} exercise={exercise}/>)}</div><KebabMenu label={`${template.name} toiminnot`} items={[{ label: 'Muokkaa ohjelmaa', action: () => onEdit(template) }, { label: 'Poista ohjelma', danger: true, action: () => onDelete(template) }]}/></header>
        <div className="program-copy"><p>{children.length} liikettä</p><h3>{template.name}</h3>{template.notes && <small>{template.notes}</small>}</div>
        <div className="program-exercise-names">{infos.slice(0, 4).map((exercise) => exercise.name).join(' · ')}{infos.length > 4 ? ` +${infos.length - 4}` : ''}</div>
        <button className="primary-button wide" onClick={() => onStart(template)}><Play size={18} fill="currentColor"/> Aloita treeni</button>
      </Glass>
    })}</div>}
  </div>
}

function SettingsPanel({ user, syncState, onSync, onDismiss }: { user: AppUser; syncState: SyncState; onSync: () => Promise<void>; onDismiss: () => void }) {
  const [usersOpen, setUsersOpen] = useState(false)
  const exportData = async () => {
    const response = await fetch('/api/export')
    if (!response.ok) throw new Error('Vienti epäonnistui')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `punttis-export-${new Date().toISOString().slice(0, 10)}.json`; anchor.click()
    URL.revokeObjectURL(url)
  }
  return <Modal title="Asetukset" top onDismiss={onDismiss} className="settings-panel">
    <div className="settings-account"><span><ShieldCheck size={21}/></span><div><strong>{user.displayName || user.email.split('@')[0]}</strong><small>{user.email} · {user.loginMethod}</small></div></div>
    <div className="settings-list">
      {user.role === 'owner' && <button onClick={() => setUsersOpen(true)}><Users size={20}/><span><strong>Käyttäjät</strong><small>Kutsut ja käyttöoikeudet</small></span></button>}
      <button onClick={() => void onSync()}><RefreshCw className={syncState === 'syncing' ? 'spin' : ''} size={20}/><span><strong>Synkronoi nyt</strong><small>{syncState === 'offline' ? 'Offline — muutokset odottavat laitteella' : syncState === 'conflict' ? 'Ristiriita ratkaistiin palvelinversioon' : 'D1 ja tämä laite'}</small></span></button>
      <button onClick={() => void exportData()}><Download size={20}/><span><strong>Vie kaikki tiedot</strong><small>JSON-varmuuskopio</small></span></button>
      <button className="danger" onClick={logout}><LogOut size={20}/><span><strong>Kirjaudu ulos</strong><small>Cloudflare Access -istunto päätetään</small></span></button>
    </div>
    <p className="settings-version">Punttis PWA · offline-first</p>
    {usersOpen && <UserManagement currentUser={user} onDismiss={() => setUsersOpen(false)}/>} 
  </Modal>
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={`tab-button ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span></button>
}

function PunttisApp({ user, initiallyOffline }: { user: AppUser; initiallyOffline: boolean }) {
  const [tab, setTab] = useState<Tab>('programs')
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot)
  const [editor, setEditor] = useState<WorkoutTemplate | 'new' | null>(null)
  const [deleteTemplate, setDeleteTemplate] = useState<WorkoutTemplate | null>(null)
  const [settings, setSettings] = useState(false)
  const [syncState, setSyncState] = useState<SyncState>(initiallyOffline || !navigator.onLine ? 'offline' : 'local')
  const [workoutOpen, setWorkoutOpen] = useState(false)
  const [discardWorkout, setDiscardWorkout] = useState(false)
  const [summary, setSummary] = useState<WorkoutSummary | null>(null)
  const [historyExerciseId, setHistoryExerciseId] = useState<string>()
  const touchStart = useRef<number | null>(null)

  const refresh = useCallback(async () => setSnapshot(await loadSnapshot()), [])
  const doSync = useCallback(async () => {
    if (!navigator.onLine) { setSyncState('offline'); return }
    setSyncState('syncing')
    try {
      const result = await syncChanges()
      setSyncState('local')
      await refresh()
    } catch { setSyncState('local') }
  }, [refresh])

  useEffect(() => {
    void (async () => {
      await getDb().exercises.bulkPut(exercises)
      await refresh()
      if (user.role === 'owner')
  void bootstrapExercises().then(doSync).catch(() => undefined)
      else void doSync()
    })()
  }, [doSync, refresh, user.role])
  useEffect(() => {
    const online = () => void doSync()
    const offline = () => setSyncState('offline')
    window.addEventListener('online', online); window.addEventListener('offline', offline)
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline) }
  }, [doSync])

  const activeSession = useMemo(() => snapshot.sessions.filter((session) => session.status === 'active').sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0], [snapshot.sessions])
  const activeRuntime = snapshot.runtimes.find((runtime) => runtime.sessionId === activeSession?.id)
  const startWorkout = async (template: WorkoutTemplate) => {
    if (activeSession) { setWorkoutOpen(true); return }
    await createSessionFromTemplate(template, snapshot)
    await refresh(); setWorkoutOpen(true); navigator.vibrate?.(12)
  }
  const removeTemplate = async () => {
    if (!deleteTemplate) return
    await softDeleteTemplate(deleteTemplate, snapshot); setDeleteTemplate(null); await refresh()
  }
  const abandonWorkout = async () => {
    if (!activeSession) return
    const timestamp = now()
    await mutate('workoutSessions', 'workout_sessions', { ...activeSession, status: 'abandoned', endedAt: timestamp, durationSeconds: elapsed(activeSession.startedAt), updatedAt: timestamp }, activeSession.updatedAt)
    if (activeRuntime) await mutate('sessionRuntime', 'session_runtime', { ...activeRuntime, deletedAt: timestamp, updatedAt: timestamp }, activeRuntime.updatedAt)
    setDiscardWorkout(false); setWorkoutOpen(false); await refresh()
  }
  const openExerciseHistory = (exerciseId: string) => {
    setWorkoutOpen(false); setHistoryExerciseId(exerciseId); setTab('history')
  }

  return <main className="app-shell">
    <div className="background-media" aria-hidden="true"><video autoPlay muted loop playsInline poster="/background-poster.webp"><source src="/background-loop.mp4" type="video/mp4"/></video></div>
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <header className="topbar glass-subtle" onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientY ?? null }} onTouchMove={(event) => {
      if (touchStart.current != null && (event.touches[0]?.clientY ?? touchStart.current) - touchStart.current > 54) { touchStart.current = null; setSettings(true); navigator.vibrate?.(8) }
    }} onTouchEnd={() => { touchStart.current = null }} onPointerDown={(event) => { touchStart.current = event.clientY }} onPointerMove={(event) => {
      if (touchStart.current != null && event.clientY - touchStart.current > 54) { touchStart.current = null; setSettings(true); navigator.vibrate?.(8) }
    }} onPointerUp={() => { touchStart.current = null }}>
      <PullHint onClick={() => setSettings(true)}/><div><p className="eyebrow">PUNTTIS</p><h1>{tabTitle[tab]}</h1></div><div className="topbar-status"><span className={`sync-dot ${syncState}`}/><small>{syncState === 'offline' ? 'Offline' : syncState === 'syncing' ? 'Synkronoidaan' : 'Tallennettu'}</small></div>
    </header>
    {tab === 'programs' && <Programs snapshot={snapshot} onStart={(template) => void startWorkout(template)} onCreate={() => setEditor('new')} onEdit={setEditor} onDelete={setDeleteTemplate}/>} 
    {tab === 'history' && <HistoryView snapshot={snapshot} focusExerciseId={historyExerciseId} onFocusHandled={() => setHistoryExerciseId(undefined)}/>} 
    {tab === 'measurements' && <MeasurementsView snapshot={snapshot} onRefresh={refresh}/>} 
    {activeSession && !workoutOpen && <CompactWorkoutDock session={activeSession} runtime={activeRuntime} onResume={() => setWorkoutOpen(true)} onDiscard={() => setDiscardWorkout(true)}/>} 
    <nav className="tabbar glass-subtle">
      <TabButton active={tab === 'programs'} icon={<Dumbbell/>} label="Ohjelmat" onClick={() => setTab('programs')}/>
      <TabButton active={tab === 'history'} icon={<History/>} label="Historia" onClick={() => setTab('history')}/>
      <TabButton active={tab === 'measurements'} icon={<Scale/>} label="Mitat" onClick={() => setTab('measurements')}/>
    </nav>
    {editor && <ProgramEditor snapshot={snapshot} template={editor === 'new' ? undefined : editor} onDismiss={() => setEditor(null)} onSaved={refresh}/>} 
    {settings && <SettingsPanel user={user} syncState={syncState} onSync={doSync} onDismiss={() => setSettings(false)}/>} 
    {deleteTemplate && <Modal title="Poista ohjelma?" onDismiss={() => setDeleteTemplate(null)}><div className="confirm-copy"><Trash2 size={28}/><p><strong>{deleteTemplate.name}</strong> poistetaan. Aiemmat treenit säilyvät historiassa.</p></div><button className="danger-button wide" onClick={() => void removeTemplate()}>Poista ohjelma</button></Modal>} 
    {discardWorkout && activeSession && <Modal title="Hylkää treeni?" onDismiss={() => setDiscardWorkout(false)}><div className="confirm-copy"><X size={28}/><p>{activeSession.name} merkitään hylätyksi. Valmiit treenit eivät muutu.</p></div><button className="danger-button wide" onClick={() => void abandonWorkout()}>Hylkää treeni</button></Modal>} 
    {workoutOpen && activeSession && <WorkoutView session={activeSession} snapshot={snapshot} onDismiss={() => setWorkoutOpen(false)} onRefresh={refresh} onComplete={(result) => { setWorkoutOpen(false); setSummary(result) }} onOpenHistory={openExerciseHistory}/>} 
    {summary && <Modal title="Treeni valmis" onDismiss={() => setSummary(null)}><div className="completion-hero"><span>✓</span><h2>{summary.name}</h2><p>Hyvä työ. Harjoitus on tallennettu historiaan.</p></div><div className="summary-grid"><span><strong>{time(summary.duration)}</strong><small>Kesto</small></span><span><strong>{Math.round(summary.volume).toLocaleString('fi-FI')} kg</strong><small>Volume</small></span><span><strong>{summary.sets}</strong><small>Sarjat</small></span><span><strong>{summary.reps}</strong><small>Toistot</small></span></div><button className="primary-button wide" onClick={() => { setSummary(null); setTab('history') }}>Avaa historia</button></Modal>} 
  </main>
}

type AuthState =
  | { kind: 'loading' }
  | { kind: 'ready'; user: AppUser; offline: boolean }
  | { kind: 'blocked'; code: string; email?: string; detail?: string }

function AccessGate({ state }: { state: Extract<AuthState, { kind: 'blocked' }> }) {
  const offline = state.code === 'offline_login_required'
  const relink = state.code === 'identity_relink_required'
  const disabled = state.code === 'disabled'
  const localDatabase = state.code === 'local_database_failed'
  return <main className="app-shell auth-shell">
    <div className="background-media" aria-hidden="true"><video autoPlay muted loop playsInline poster="/background-poster.webp"><source src="/background-loop.mp4" type="video/mp4"/></video></div>
    <Glass className="auth-card">
      <span className="auth-icon">{offline ? <WifiOff/> : <ShieldCheck/>}</span>
      <p className="eyebrow">POWER</p>
      <h1>{offline ? 'Kirjautuminen tarvitsee verkon' : localDatabase ? 'Paikallisen datan avaaminen epäonnistui' : disabled ? 'Käyttäjä on estetty' : relink ? 'Kirjautuminen pitää yhdistää uudelleen' : 'Tälle sähköpostille ei ole kutsua'}</h1>
      <p>{offline ? 'Ensimmäinen kirjautuminen ja 30 päivän välein tehtävä varmennus vaativat verkkoyhteyden.' : localDatabase ? <>Palvelintili on kunnossa, mutta tämän laitteen tietokantaa ei voitu avata. <small>{state.detail}</small></> : disabled ? 'Omistaja on poistanut tämän käyttäjän käyttöoikeuden.' : relink ? 'Pyydä omistajaa nollaamaan tilin kirjautumissidos.' : <>{state.email && <strong>{state.email}</strong>} ei ole vielä Punttiksen hyväksytty käyttäjä. Pyydä omistajaa lisäämään sama sähköposti käyttäjälistaan.</>}</p>
      {!offline && <button className="surface-button wide" onClick={logout}><LogOut size={18}/> Kirjaudu toisella tilillä</button>}
      {offline && <button className="surface-button wide" onClick={() => window.location.reload()}><RefreshCw size={18}/> Yritä uudelleen</button>}
    </Glass>
  </main>
}

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ kind: 'loading' })
  useEffect(() => {
    void (async () => {
      try {
        const session = await currentUser()
        try {
          await initializeUserDatabase(session.user)
        } catch (error) {
          setAuth({ kind: 'blocked', code: 'local_database_failed', detail: error instanceof Error ? `${error.name}: ${error.message}` : 'Tuntematon tietokantavirhe' })
          return
        }
        setAuth({ kind: 'ready', ...session })
      } catch (error) {
        if (error instanceof AccountAccessError) setAuth({ kind: 'blocked', code: error.code, email: error.email })
        else setAuth({ kind: 'blocked', code: 'authentication_failed' })
      }
    })()
  }, [])
  if (auth.kind === 'loading') return <main className="app-shell auth-shell"><div className="background-media" aria-hidden="true"/><Glass className="auth-card"><span className="loading-ring"/><p>Avataan Punttista…</p></Glass></main>
  if (auth.kind === 'blocked') return <AccessGate state={auth}/>
  return <PunttisApp user={auth.user} initiallyOffline={auth.offline}/>
}
