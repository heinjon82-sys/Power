import { useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, Plus, Ruler, Scale } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Snapshot } from '../lib/data'
import { mutate } from '../lib/data'
import { inRange, rangeOptions, type RangeKey } from '../lib/analytics'
import { id, now } from '../lib/utils'
import type { BodyMeasurement, BodyMeasurementType } from '../types'
import { Glass, Modal, RangePills } from './ui'

type MeasurementDefinition = {
  type: Exclude<BodyMeasurementType, 'arm'>
  name: string
  shortName: string
  unit: BodyMeasurement['unit']
  group: 'body' | 'composition'
}

export const measurementDefinitions: MeasurementDefinition[] = [
  { type: 'weight', name: 'Paino', shortName: 'Paino', unit: 'kg', group: 'body' },
  { type: 'chest', name: 'Rinta', shortName: 'Rinta', unit: 'cm', group: 'body' },
  { type: 'waist', name: 'Vyötärö', shortName: 'Vyötärö', unit: 'cm', group: 'body' },
  { type: 'hip', name: 'Lantio', shortName: 'Lantio', unit: 'cm', group: 'body' },
  { type: 'thigh_right', name: 'Reisi oikea', shortName: 'Reisi oik.', unit: 'cm', group: 'body' },
  { type: 'thigh_left', name: 'Reisi vasen', shortName: 'Reisi vas.', unit: 'cm', group: 'body' },
  { type: 'arm_right', name: 'Olkavarsi oikea', shortName: 'Käsi oik.', unit: 'cm', group: 'body' },
  { type: 'arm_left', name: 'Olkavarsi vasen', shortName: 'Käsi vas.', unit: 'cm', group: 'body' },
  { type: 'bodyfat', name: 'Rasvaprosentti', shortName: 'Rasva', unit: '%', group: 'composition' },
  { type: 'muscle', name: 'Lihasmassa', shortName: 'Lihas', unit: 'kg', group: 'composition' },
  { type: 'fat_mass', name: 'Rasvamassa', shortName: 'Rasvamassa', unit: 'kg', group: 'composition' },
  { type: 'bmi', name: 'Painoindeksi', shortName: 'BMI', unit: 'BMI', group: 'composition' }
]

const formatValue = (value: number, unit: BodyMeasurement['unit']) => `${value.toLocaleString('fi-FI', { maximumFractionDigits: 1 })}${unit === 'BMI' ? '' : ` ${unit}`}`

export function measurementRows(measurements: BodyMeasurement[], range: RangeKey) {
  const rows = new Map<string, Record<string, string | number>>()
  measurements.filter((item) => inRange(item.measuredAt, range)).forEach((item) => {
    const key = item.measuredAt.slice(0, 10)
    const row = rows.get(key) ?? { date: key, label: new Date(item.measuredAt).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' }) }
    row[item.type === 'arm' ? 'arm_right' : item.type] = item.value
    rows.set(key, row)
  })
  return [...rows.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
}

function AddMeasurements({ snapshot, onDismiss, onSaved }: { snapshot: Snapshot; onDismiss: () => void; onSaved: () => Promise<void> }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const parse = (value: string) => {
    const parsed = Number(value.replace(',', '.'))
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
  }
  const valid = measurementDefinitions.flatMap((definition) => {
    const value = parse(values[definition.type] ?? '')
    return value == null ? [] : [{ definition, value }]
  })
  const latest = (type: BodyMeasurementType) => snapshot.measurements.filter((item) => (item.type === type || (type === 'arm_right' && item.type === 'arm'))).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0]
  const save = async () => {
    if (!valid.length || saving) return
    setSaving(true)
    setError('')
    try {
      const timestamp = now()
      const measuredAt = new Date(`${date}T12:00:00`).toISOString()
      for (const item of valid) await mutate('bodyMeasurements', 'body_measurements', {
        id: id(), type: item.definition.type, value: item.value, unit: item.definition.unit,
        measuredAt, note: note.trim() || undefined, updatedAt: timestamp
      })
      await onSaved(); onDismiss()
    } catch {
      setError('Mittausten tallennus epäonnistui. Arvot jäivät lomakkeelle, joten voit yrittää uudelleen.')
      setSaving(false)
    }
  }
  return <Modal title="Uusi mittaus" onDismiss={onDismiss} className="measurement-modal">
    <label className="field-label">Päivämäärä<input type="date" value={date} onChange={(event) => setDate(event.target.value)}/></label>
    {(['body', 'composition'] as const).map((group) => <section className="measurement-input-group" key={group}><header><h3>{group === 'body' ? 'Mitat' : 'Kehonkoostumus'}</h3><span>{group === 'body' ? <Ruler size={17}/> : <Scale size={17}/>}</span></header><div>{measurementDefinitions.filter((item) => item.group === group).map((definition) => {
      const previous = latest(definition.type)
      return <label key={definition.type}><span><strong>{definition.name}</strong>{previous && <small>Viimeksi {formatValue(previous.value, definition.unit)}</small>}</span><span className="unit-input"><input inputMode="decimal" value={values[definition.type] ?? ''} placeholder={previous ? String(previous.value).replace('.', ',') : '—'} onChange={(event) => setValues((current) => ({ ...current, [definition.type]: event.target.value }))}/><small>{definition.unit}</small></span></label>
    })}</div></section>)}
    <label className="field-label">Muistiinpano<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Vapaaehtoinen huomio"/></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary-button wide" disabled={!valid.length || saving} onClick={() => void save()}>{saving ? 'Tallennetaan…' : `Tallenna ${valid.length || ''} ${valid.length === 1 ? 'mittaus' : 'mittausta'}`}</button>
  </Modal>
}

function MeasurementChart({ title, definitions, rows, selected, onSelect }: {
  title: string
  definitions: MeasurementDefinition[]
  rows: Array<Record<string, string | number>>
  selected: BodyMeasurementType
  onSelect: (type: BodyMeasurementType) => void
}) {
  const definition = definitions.find((item) => item.type === selected) ?? definitions[0]
  const values = rows.flatMap((row) => typeof row[definition.type] === 'number' ? [Number(row[definition.type])] : [])
  const latest = values.at(-1)
  const first = values[0]
  const change = latest != null && first != null ? latest - first : 0
  return <Glass className="measurement-chart" as="section">
    <header><div><p className="eyebrow">{title}</p><h2>{latest == null ? '—' : formatValue(latest, definition.unit)}</h2><small className={change > 0 ? 'up' : change < 0 ? 'down' : ''}>{values.length > 1 ? `${change > 0 ? '+' : ''}${change.toLocaleString('fi-FI', { maximumFractionDigits: 1 })} ${definition.unit === 'BMI' ? '' : definition.unit}` : 'Ei vielä trendiä'}</small></div><Scale size={21}/></header>
    <div className="metric-scroll">{definitions.map((item) => <button className={item.type === definition.type ? 'selected' : ''} key={item.type} onClick={() => onSelect(item.type)}>{item.shortName}</button>)}</div>
    <div className="measurement-chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={rows} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}><defs><linearGradient id={`measurement-${definition.type}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff9d57" stopOpacity={0.5}/><stop offset="100%" stopColor="#ff9d57" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="rgba(197,211,235,.1)" vertical={false}/><XAxis dataKey="label" stroke="#8794aa" tickLine={false} axisLine={false} fontSize={11}/><YAxis domain={['auto', 'auto']} stroke="#8794aa" tickLine={false} axisLine={false} fontSize={11}/><Tooltip contentStyle={{ background: '#171d29', border: '1px solid rgba(255,255,255,.16)', borderRadius: 14 }} formatter={(value) => [formatValue(Number(value), definition.unit), definition.name]}/><Area connectNulls type="monotone" dataKey={definition.type} stroke="#ff9d57" strokeWidth={3} fill={`url(#measurement-${definition.type})`} activeDot={{ r: 6 }}/></AreaChart></ResponsiveContainer>{!values.length && <div className="chart-empty">Lisää ensimmäinen {definition.name.toLocaleLowerCase('fi-FI')}.</div>}</div>
  </Glass>
}

export function MeasurementsView({ snapshot, onRefresh }: { snapshot: Snapshot; onRefresh: () => Promise<void> }) {
  const [range, setRange] = useState<RangeKey>('90')
  const [showAdd, setShowAdd] = useState(false)
  const [bodyMetric, setBodyMetric] = useState<BodyMeasurementType>('weight')
  const [compositionMetric, setCompositionMetric] = useState<BodyMeasurementType>('bodyfat')
  const [showAll, setShowAll] = useState(false)
  const rows = useMemo(() => measurementRows(snapshot.measurements, range), [range, snapshot.measurements])
  const descending = [...rows].reverse()
  const body = measurementDefinitions.filter((item) => item.group === 'body')
  const composition = measurementDefinitions.filter((item) => item.group === 'composition')
  const tableDefinitions = [...body, ...composition]

  return <div className="content measurements-view">
    <div className="measurement-actions"><div><p className="eyebrow">SEURANTA</p><h2>Kehon muutos</h2></div><button className="primary-button compact" onClick={() => setShowAdd(true)}><Plus size={18}/> Lisää</button></div>
    <RangePills options={rangeOptions} value={range} onChange={setRange}/>
    <MeasurementChart title="Mitat" definitions={body} rows={rows} selected={bodyMetric} onSelect={setBodyMetric}/>
    <MeasurementChart title="Kehonkoostumus" definitions={composition} rows={rows} selected={compositionMetric} onSelect={setCompositionMetric}/>
    <div className="section-header"><div><p className="eyebrow">MERKINNÄT</p><h2>Historia</h2></div><span>{rows.length} päivää</span></div>
    {!rows.length ? <Glass className="empty"><Scale size={30}/><h3>Kaikki mitat samasta paikasta</h3><p>Tallenna samalla kertaa paino, ympärysmitat ja kehonkoostumus.</p><button className="primary-button" onClick={() => setShowAdd(true)}><Plus size={18}/> Uusi mittaus</button></Glass> : <Glass className="measurement-history" as="section"><div className="measurement-table-scroll"><table><thead><tr><th>Pvm</th>{tableDefinitions.map((item) => <th key={item.type}>{item.shortName}</th>)}</tr></thead><tbody>{descending.slice(0, showAll ? undefined : 8).map((row) => <tr key={String(row.date)}><td><CalendarDays size={14}/>{new Date(String(row.date)).toLocaleDateString('fi-FI')}</td>{tableDefinitions.map((item) => <td key={item.type}>{typeof row[item.type] === 'number' ? formatValue(Number(row[item.type]), item.unit) : '—'}</td>)}</tr>)}</tbody></table></div>{descending.length > 8 && <button className="history-expand" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Näytä vähemmän' : 'Näytä kaikki'}<ChevronDown className={showAll ? 'rotated' : ''} size={17}/></button>}</Glass>}
    {showAdd && <AddMeasurements snapshot={snapshot} onDismiss={() => setShowAdd(false)} onSaved={onRefresh}/>} 
  </div>
}
