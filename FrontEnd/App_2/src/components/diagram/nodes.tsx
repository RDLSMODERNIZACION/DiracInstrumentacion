import React from 'react'
import { Droplets } from 'lucide-react'
import { byId, type NodeBase } from '@/data/graph'

export function GroupBox({
  x, y, w, h, label,
}: { x:number; y:number; w:number; h:number; label:string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={14} className="fill-slate-50 stroke-slate-200" />
      <rect x={x} y={y} width={w} height={h} rx={14} fill="none" className="stroke-slate-300" strokeDasharray="6 6" />
      <text x={x + 12} y={y + 20} className="fill-slate-500 text-[12px]">{label}</text>
    </g>
  )
}

/**
 * AutoGroupBox: calcula una caja que engloba automáticamente a los nodos indicados.
 * - pad: margen interno uniforme
 * - grow: expansión opcional por lado (left/right/top/bottom) para dar más “aire”
 */
export function AutoGroupBox({
  ids, label, pad = 28, grow = { left: 0, right: 0, top: 0, bottom: 0 },
}: {
  ids: string[]
  label: string
  pad?: number
  grow?: { left?: number; right?: number; top?: number; bottom?: number }
}) {
  const pts = ids.map(id => byId[id]).filter(Boolean) as NodeBase[]
  if (!pts.length) return null

  const xs = pts.map(p => p.x)
  const ys = pts.map(p => p.y)

  const minX = Math.min(...xs) - pad - (grow.left ?? 0)
  const maxX = Math.max(...xs) + pad + (grow.right ?? 0)
  const minY = Math.min(...ys) - pad - (grow.top ?? 0)
  const maxY = Math.max(...ys) + pad + (grow.bottom ?? 0)

  const w = maxX - minX
  const h = maxY - minY

  return <GroupBox x={minX} y={minY} w={w} h={h} label={label} />
}

export function Tank({ n }: { n: NodeBase }) {
  const level = n.level ?? 0
  const levelH = 60 * level
  return (
    <g>
      <rect x={n.x - 60} y={n.y - 40} width={120} height={80} rx={12} className="fill-white stroke-slate-300" />
      <rect x={n.x - 45} y={n.y - 25} width={90} height={50} rx={8} className="fill-slate-100 stroke-slate-200" />
      <rect x={n.x - 45} y={n.y - 25 + (50 - levelH)} width={90} height={levelH} className="fill-sky-300/70" />
      <text x={n.x} y={n.y - 50} textAnchor="middle" className="fill-slate-800 text-[12px] font-semibold">{n.name}</text>
      <text x={n.x} y={n.y + 38} textAnchor="middle" className="fill-slate-600 text-[11px]">
        Nivel {(level * 100).toFixed(0)}% • {n.capacity} m³
      </text>
    </g>
  )
}

export function Pump({ n }: { n: NodeBase }) {
  return (
    <g>
      <circle cx={n.x} cy={n.y} r={26} className="fill-white stroke-slate-300" />
      <Droplets width={18} height={18} x={n.x - 9} y={n.y - 9} className="stroke-slate-700" />
      <circle
        cx={n.x + 27}
        cy={n.y - 27}
        r={6}
        className={`stroke-white ${
          n.status === 'on'
            ? 'fill-emerald-500'
            : n.status === 'standby'
            ? 'fill-amber-500'
            : n.status === 'fault'
            ? 'fill-rose-600'
            : 'fill-slate-400'
        }`}
      />
      <text x={n.x} y={n.y + 36} textAnchor="middle" className="fill-slate-800 text-[12px] font-semibold">{n.name}</text>
      <text x={n.x} y={n.y + 52} textAnchor="middle" className="fill-slate-600 text-[11px]">{n.kW} kW</text>
    </g>
  )
}

export function Valve({ n }: { n: NodeBase }) {
  const color = n.state === 'open' ? 'fill-emerald-500' : n.state === 'closed' ? 'fill-rose-600' : 'fill-amber-500'
  return (
    <g>
      <rect x={n.x - 16} y={n.y - 10} width={32} height={20} rx={4} className="fill-white stroke-slate-300" />
      <circle cx={n.x} cy={n.y} r={7} className={`stroke-white ${color}`} />
      <text x={n.x} y={n.y + 26} textAnchor="middle" className="fill-slate-700 text-[11px]">{n.name} • {n.state}</text>
    </g>
  )
}

export function Manifold({ n }: { n: NodeBase }) {
  return (
    <g>
      <rect x={n.x - 50} y={n.y - 8} width={100} height={16} rx={6} className="fill-slate-200 stroke-slate-300" />
      <text x={n.x} y={n.y - 14} textAnchor="middle" className="fill-slate-600 text-[11px]">{n.name}</text>
    </g>
  )
}
