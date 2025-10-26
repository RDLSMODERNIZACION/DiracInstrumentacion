// src/lib/kpi-loader.ts
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'

declare global {
  interface Window {
    React?: any
    ReactDOM?: any
    ReactDOMClient?: any
    process?: any
    global?: any
    globalThis?: any
    KpiWidget?: any
  }
}

export type MountOptions = {
  jsUrl?: string
  cssUrl?: string
  version?: string
}

function isViteDev(): boolean {
  // @ts-ignore
  return typeof import.meta !== 'undefined' && !!import.meta.env?.DEV
}

function ensureGlobals() {
  const g = window as any
  g.React = g.React || React
  // 👇 ahora exponemos ambos
  g.ReactDOM = g.ReactDOM || ReactDOM
  g.ReactDOMClient = g.ReactDOMClient || ReactDOMClient

  g.globalThis = g.globalThis || g
  g.global = g.global || g
  if (!g.process) g.process = { env: { NODE_ENV: isViteDev() ? 'development' : 'production' } }
  else {
    g.process.env = g.process.env || {}
    if (!g.process.env.NODE_ENV) g.process.env.NODE_ENV = isViteDev() ? 'development' : 'production'
  }
}

function ensureStyle(href: string) {
  if (!document.querySelector(`link[data-kpi-style="${href}"]`)) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.setAttribute('data-kpi-style', href)
    document.head.appendChild(link)
  }
}

async function fetchText(url: string) {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(String(res.status))
  return res.text()
}

async function resolveUmdUrl(candidates: string[]) {
  for (const u of candidates) {
    try { await fetchText(u + (u.includes('?') ? '' : `?v=${Date.now()}`)); return u }
    catch {}
  }
  throw new Error('No se pudo resolver ningún UMD del KPI')
}

async function loadUmd(url: string, version: string) {
  const bust = `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}`
  const code = await fetchText(bust)

  const g = window as any
  try { delete g.KpiWidget } catch {}

  // 👇 shim de require: devuelve el objeto correcto
  const requireShim = (id: string) => {
    if (id === 'react') return g.React
    if (id === 'react-dom') return g.ReactDOM
    if (id === 'react-dom/client') return g.ReactDOMClient || g.ReactDOM
    throw new Error(`[kpi-loader] require('${id}') no soportado`)
  }

  const module = { exports: {} as any }
  const fn = new Function(
    'module',
    'exports',
    'require',
    'process',
    'global',
    'globalThis',
    code + `\n//# sourceURL=${url}\n;return module.exports && Object.keys(module.exports).length
      ? module.exports
      : (global.KpiWidget || globalThis.KpiWidget || {});`
  )
  const exports = fn(module, module.exports, requireShim, g.process, g, g) || module.exports
  return exports
}

let currentUnmount: null | (() => void) = null

export async function mountKpi(
  container: HTMLElement,
  props: Record<string, any> = {},
  opts: MountOptions = {}
) {
  ensureGlobals()

  const defaults = isViteDev()
    ? ['/kpi/kpi-widget.dev.umd.js', '/kpi/kpi-widget.umd.js']
    : ['/kpi/kpi-widget.umd.js']

  const jsUrl = opts.jsUrl ?? await resolveUmdUrl(defaults)
  const cssUrl = opts.cssUrl ?? '/kpi/style.css'
  const version = opts.version ?? (isViteDev() ? 'dev-' + Date.now() : 'prod')

  ensureStyle(`${cssUrl}?v=${encodeURIComponent(version)}`)

  if (currentUnmount) { try { currentUnmount() } catch {} currentUnmount = null }
  container.innerHTML = ''

  const api = await loadUmd(jsUrl, version)
  const mountFn =
    api?.mountKpiWidget ??
    api?.default?.mount ??
    api?.mount

  if (typeof mountFn !== 'function') {
    throw new Error('mountKpiWidget no encontrado en el UMD del widget')
  }

  currentUnmount = mountFn(container, { title: 'KPIs', ...props })

  const widgetVersion =
    api?.KPI_WIDGET_VERSION ??
    api?.default?.version ??
    'unknown'

  console.log('[kpi-loader] mounted', {
    jsUrl, widgetVersion,
    reactVersion: (window as any).React?.version,
    hasPortal: typeof (window as any).ReactDOM?.createPortal === 'function',
    hasCreateRoot: typeof (window as any).ReactDOMClient?.createRoot === 'function',
  })

  return {
    unmount: () => { if (currentUnmount) { try { currentUnmount() } finally { currentUnmount = null } } },
    version: widgetVersion,
  }
}

export function unmountKpi() {
  if (currentUnmount) { try { currentUnmount() } finally { currentUnmount = null } }
}

export async function defineKpiElement(tagName = 'kpi-widget', opts: MountOptions = {}) {
  ensureGlobals()
  const defaults = isViteDev()
    ? ['/kpi/kpi-widget.dev.umd.js', '/kpi/kpi-widget.umd.js']
    : ['/kpi/kpi-widget.umd.js']
  const jsUrl = opts.jsUrl ?? await resolveUmdUrl(defaults)
  const version = opts.version ?? (isViteDev() ? 'dev-' + Date.now() : 'prod')
  const api = await loadUmd(jsUrl, version)

  const define =
    api?.defineKpiWidgetElement ??
    api?.default?.defineElement

  if (typeof define !== 'function') {
    throw new Error('defineKpiWidgetElement no encontrado en el UMD del widget')
  }
  define(tagName)
}

const _default = { mountKpi, unmountKpi, defineKpiElement }
export default _default
