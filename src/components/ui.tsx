import { useEffect, useRef, useState } from 'react'
import { ChevronDown, MoreHorizontal, X } from 'lucide-react'
import type { Exercise } from '../types'
import { exerciseGlyph } from '../data/exercises'

export function Glass({ children, className = '', as = 'section', id }: {
  children: React.ReactNode
  className?: string
  as?: 'section' | 'div' | 'article'
  id?: string
}) {
  const Tag = as
  return <Tag id={id} className={`glass ${className}`}>{children}</Tag>
}

export function ExerciseAvatar({ exercise, size = 'medium' }: { exercise?: Exercise; size?: 'small' | 'medium' | 'large' }) {
  const [failed, setFailed] = useState(false)
  if (!exercise || failed) return <span className={`exercise-glyph avatar-${size}`}>{exercise ? exerciseGlyph(exercise) : '•'}</span>
  return <img className={`exercise-avatar avatar-${size}`} src={exercise.imageThumbPath} alt="" onError={() => setFailed(true)} />
}

export function Modal({ title, children, onDismiss, top = false, className = '' }: {
  title: string
  children: React.ReactNode
  onDismiss: () => void
  top?: boolean
  className?: string
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onDismiss() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onDismiss])
  return <div className={`modal-layer ${top ? 'modal-from-top' : ''}`} role="presentation">
    <button className="modal-backdrop" onClick={onDismiss} aria-label="Sulje" />
    <section className={`modal glass ${className}`} role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-header"><div><span className="sheet-handle"/><h2>{title}</h2></div><button className="icon-button" onClick={onDismiss} aria-label="Sulje"><X size={20}/></button></header>
      {children}
    </section>
  </div>
}

export type MenuItem = { label: string; action: () => void; danger?: boolean; disabled?: boolean }

export function KebabMenu({ items, label = 'Toiminnot' }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  return <div className="kebab" ref={root}>
    <button className="kebab-button" aria-label={label} aria-expanded={open} onClick={() => setOpen((value) => !value)}><MoreHorizontal size={21}/></button>
    {open && <div className="kebab-popover" role="menu">{items.map((item) => <button key={item.label} role="menuitem" className={item.danger ? 'danger' : ''} disabled={item.disabled} onClick={() => { setOpen(false); item.action() }}>{item.label}</button>)}</div>}
  </div>
}

export function RangePills<T extends string>({ options, value, onChange }: {
  options: Array<{ key: T; label: string }>
  value: T
  onChange: (value: T) => void
}) {
  return <div className="pill-row">{options.map((option) => <button key={option.key} className={value === option.key ? 'selected' : ''} onClick={() => onChange(option.key)}>{option.label}</button>)}</div>
}

export function PullHint({ onClick }: { onClick?: () => void }) {
  return <button className="pull-hint" aria-label="Avaa asetukset" onClick={onClick}><ChevronDown size={14}/></button>
}
