import { useEffect, useMemo, useState } from 'react'
import { Activity, BarChart3, ChevronRight, Clock3, Dumbbell, Search, Trophy } from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts'
import type { Snapshot } from '../lib/data'
import { estimatedOneRepMax, inRange, rangeOptions, sessionSummary, weeklySeries, type RangeKey } from '../lib/analytics'
import { kg, time, volume } from '../lib/utils'
import type { Exercise, WorkoutSession } from '../types'
import { ExerciseAvatar, Glass, Modal, RangePills } from './ui'

type ExerciseMetric = 'load' | 'reps' | 'volume' | 'oneRm'

const chartTheme = {
  orange: '#ff9d57', pale: '#ffd0a7', grid: 'rgba(197, 211, 235, .11)', muted: '#8d9ab0'
}

const metricOptions: Array<{ key: ExerciseMetric; label: string }> = [
  { key: 'load', label: 'Paino' }, { key: 'reps', label: 'Toistot' },
  { key: 'volume', label: 'Volume' }, { key: 'oneRm', label: '1RM' }
]

function ExerciseProgress({ exercise, snapshot, onDismiss }: { exercise: Exercise; snapshot: Snapshot; onDismiss: () => void }) {
  const [range, setRange] = useState<RangeKey>('90')
  const [metric, setMetric] = useState<ExerciseMetric>('load')
  const points = useMemo(() => snapshot.sessions
    .filter((session) => session.status === 'completed' && inRange(session.endedAt ?? session.startedAt, range))
    .flatMap((session) => snapshot.sessionExercises
      .filter((item) => item.sessionId === session.id && item.exerciseId === exercise.id)
      .map((item) => {
        const sets = snapshot.sessionSets.filter((set) => set.sessionExerciseId === item.id && set.isCompleted)
        if (!sets.length) return null
        return {
          date: session.endedAt ?? session.startedAt,
          label: new Date(session.endedAt ?? session.startedAt).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' }),
          load: Math.max(...sets.map((set) => set.actualLoad ?? 0)),
          reps: Math.max(...sets.map((set) => set.actualReps ?? 0)),
          volume: Math.round(volume(sets)),
          oneRm: Math.round(Math.max(...sets.map((set) => estimatedOneRepMax(set.actualLoad, set.actualReps))) * 10) / 10,
          sets
        }
      }))
    .filter((point): point is NonNullable<typeof point> => Boolean(point))
    .sort((a, b) => a.date.localeCompare(b.date)), [exercise.id, range, snapshot])
  const latest = points.at(-1)
  const best = points.length ? Math.max(...points.map((point) => point[metric])) : 0
  const suffix = metric === 'reps' ? '' : ' kg'

  return <Modal title={exercise.name} onDismiss={onDismiss} className="detail-modal">
    <div className="exercise-detail-hero">
      <img src={exercise.imageFullPath} alt={exercise.name} onError={(event) => { event.currentTarget.src = exercise.imageThumbPath }}/>
      <div><p className="eyebrow">{exercise.familyName}</p><h3>{exercise.name}</h3><p>{exercise.primaryMuscles.join(', ')}</p></div>
    </div>
    <RangePills options={rangeOptions} value={range} onChange={setRange}/>
    <RangePills options={metricOptions} value={metric} onChange={setMetric}/>
    <Glass className="chart-card inset" as="div">
      <div className="chart-card-header"><span>Paras {metricOptions.find((item) => item.key === metric)?.label.toLowerCase()}</span><strong>{best.toLocaleString('fi-FI')}{suffix}</strong></div>
      <div className="chart-height"><ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid stroke={chartTheme.grid} vertical={false}/><XAxis dataKey="label" stroke={chartTheme.muted} tickLine={false} axisLine={false} fontSize={11}/><YAxis stroke={chartTheme.muted} tickLine={false} axisLine={false} fontSize={11}/>
        <Tooltip contentStyle={{ background: '#171d29', border: '1px solid rgba(255,255,255,.16)', borderRadius: 14 }} formatter={(value) => [`${Number(value).toLocaleString('fi-FI')}${suffix}`, '']}/>
        <Line type="monotone" dataKey={metric} stroke={chartTheme.orange} strokeWidth={3} dot={{ r: 3, fill: chartTheme.pale }} activeDot={{ r: 6 }}/>
      </LineChart></ResponsiveContainer></div>
      {!points.length && <div className="chart-empty">Ei suorituksia valitulla aikavälillä.</div>}
    </Glass>
    {latest && <div className="latest-sets"><h3>Viimeisin suoritus</h3>{latest.sets.map((set) => <div key={set.id}><span>Sarja {set.setIndex + 1}</span><strong>{set.actualLoad ?? '—'} kg × {set.actualReps ?? '—'}</strong></div>)}</div>}
  </Modal>
}

function SessionDetail({ session, snapshot, onDismiss }: { session: WorkoutSession; snapshot: Snapshot; onDismiss: () => void }) {
  const exercises = snapshot.sessionExercises.filter((item) => item.sessionId === session.id).sort((a, b) => a.orderIndex - b.orderIndex)
  const summary = sessionSummary(session, snapshot.sessionExercises, snapshot.sessionSets)
  return <Modal title={session.name} onDismiss={onDismiss} className="detail-modal">
    <p className="detail-date">{new Date(session.endedAt ?? session.startedAt).toLocaleString('fi-FI', { dateStyle: 'long', timeStyle: 'short' })}</p>
    <div className="summary-grid compact"><span><strong>{time(summary.duration)}</strong><small>Kesto</small></span><span><strong>{kg(summary.volume, true)}</strong><small>Volume</small></span><span><strong>{summary.sets}</strong><small>Sarjat</small></span><span><strong>{summary.reps}</strong><small>Toistot</small></span></div>
    <div className="session-detail-list">{exercises.map((item) => {
      const info = snapshot.exercises.find((exercise) => exercise.id === item.exerciseId)
      const sets = snapshot.sessionSets.filter((set) => set.sessionExerciseId === item.id && set.isCompleted).sort((a, b) => a.setIndex - b.setIndex)
      return <Glass key={item.id} className="session-detail-exercise" as="article"><header><ExerciseAvatar exercise={info}/><div><h3>{item.nameSnapshot}</h3><small>{sets.length} sarjaa</small></div></header>{sets.map((set) => <div className="history-set" key={set.id}><span>{set.setIndex + 1}</span><strong>{set.actualLoad ?? '—'} kg</strong><strong>{set.actualReps ?? '—'} toistoa</strong></div>)}</Glass>
    })}</div>
  </Modal>
}

export function HistoryView({ snapshot, focusExerciseId, onFocusHandled }: { snapshot: Snapshot; focusExerciseId?: string; onFocusHandled?: () => void }) {
  const [range, setRange] = useState<RangeKey>('90')
  const [query, setQuery] = useState('')
  const [sessionDetail, setSessionDetail] = useState<WorkoutSession | null>(null)
  const [exerciseDetail, setExerciseDetail] = useState<Exercise | null>(null)
  const sessions = useMemo(() => snapshot.sessions.filter((session) => session.status === 'completed').sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? '')), [snapshot.sessions])
  const visibleSessions = sessions.filter((session) => inRange(session.endedAt ?? session.startedAt, range))
  const weeks = weeklySeries(snapshot.sessions, snapshot.sessionExercises, snapshot.sessionSets, range)
  const totals = visibleSessions.reduce((all, session) => {
    const summary = sessionSummary(session, snapshot.sessionExercises, snapshot.sessionSets)
    return { sessions: all.sessions + 1, sets: all.sets + summary.sets, duration: all.duration + summary.duration, volume: all.volume + summary.volume }
  }, { sessions: 0, sets: 0, duration: 0, volume: 0 })
  const usedExercises = useMemo(() => {
    const ids = new Set(snapshot.sessionExercises.filter((item) => snapshot.sessions.some((session) => session.id === item.sessionId && session.status === 'completed') && snapshot.sessionSets.some((set) => set.sessionExerciseId === item.id && set.isCompleted)).map((item) => item.exerciseId))
    return snapshot.exercises.filter((exercise) => ids.has(exercise.id) && exercise.name.toLocaleLowerCase('fi-FI').includes(query.trim().toLocaleLowerCase('fi-FI')))
  }, [query, snapshot])

  useEffect(() => {
    if (!focusExerciseId) return
    const exercise = snapshot.exercises.find((item) => item.id === focusExerciseId)
    if (exercise) setExerciseDetail(exercise)
    onFocusHandled?.()
  }, [focusExerciseId, onFocusHandled, snapshot.exercises])

  const trends: Array<{ key: 'sessions' | 'sets' | 'duration' | 'volume'; label: string; value: string; icon: React.ReactNode }> = [
    { key: 'sessions', label: 'Treenit', value: String(totals.sessions), icon: <Dumbbell size={16}/> },
    { key: 'sets', label: 'Sarjat', value: String(totals.sets), icon: <Activity size={16}/> },
    { key: 'duration', label: 'Aika', value: totals.duration < 3600 ? `${Math.round(totals.duration / 60)} min` : `${Math.round(totals.duration / 3600)} h`, icon: <Clock3 size={16}/> },
    { key: 'volume', label: 'Volume', value: kg(totals.volume, true), icon: <BarChart3 size={16}/> }
  ]

  return <div className="content history-view">
    <RangePills options={rangeOptions} value={range} onChange={setRange}/>
    <div className="trend-grid">{trends.map((trend) => <Glass className="trend-card" key={trend.key} as="article"><header><span>{trend.icon}{trend.label}</span><strong>{trend.value}</strong></header><div className="sparkline"><ResponsiveContainer width="100%" height="100%"><AreaChart data={weeks}><defs><linearGradient id={`fill-${trend.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chartTheme.orange} stopOpacity={0.5}/><stop offset="100%" stopColor={chartTheme.orange} stopOpacity={0}/></linearGradient></defs><Area type="monotone" dataKey={trend.key} stroke={chartTheme.orange} strokeWidth={2} fill={`url(#fill-${trend.key})`} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div></Glass>)}</div>
    <div className="section-header"><div><p className="eyebrow">KEHITYS</p><h2>Liikkeet</h2></div></div>
    <label className="search-field"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hae liikkeen historiasta"/></label>
    <div className="exercise-history-strip">{usedExercises.map((exercise) => <button key={exercise.id} onClick={() => setExerciseDetail(exercise)}><ExerciseAvatar exercise={exercise}/><span><strong>{exercise.name}</strong><small>{exercise.familyName}</small></span><Trophy size={16}/></button>)}</div>
    <div className="section-header"><div><p className="eyebrow">HARJOITUKSET</p><h2>Treenihistoria</h2></div><span>{visibleSessions.length}</span></div>
    {!visibleSessions.length ? <Glass className="empty"><Dumbbell size={30}/><h3>Historia rakentuu treenatessa</h3><p>Valmiit treenit ja sarjat ilmestyvät tähän.</p></Glass> : <div className="history-list">{visibleSessions.map((session) => {
      const summary = sessionSummary(session, snapshot.sessionExercises, snapshot.sessionSets)
      return <button className="glass history-card" key={session.id} onClick={() => setSessionDetail(session)}><div><p>{new Date(session.endedAt ?? session.startedAt).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'short' })}</p><h3>{session.name}</h3><small>{summary.sets} sarjaa · {summary.reps} toistoa · {kg(summary.volume)}</small></div><ChevronRight size={20}/></button>
    })}</div>}
    {sessionDetail && <SessionDetail session={sessionDetail} snapshot={snapshot} onDismiss={() => setSessionDetail(null)}/>} 
    {exerciseDetail && <ExerciseProgress exercise={exerciseDetail} snapshot={snapshot} onDismiss={() => setExerciseDetail(null)}/>} 
  </div>
}
