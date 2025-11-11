import React from 'react'
import { createRoot } from 'react-dom/client'
import KpiWidget from "./widget";
import './index.css'

import DebugConsole from './components/DebugConsole'
import { setupDebugInterceptors, isDebugEnabled, push } from './debug/LogBus'
import { getCompanyId } from './lib/scope'

// Instalar interceptores de debug (console + fetch) si corresponde
setupDebugInterceptors()

// Log inicial del scope
try {
  const cid = getCompanyId()
  if (cid) push('info', '[scope] company_id', cid)
  else push('warn', '[scope] NO company_id (agregá ?company_id=ID o usá session/localStorage)')
} catch (e: any) {
  push('error', '[scope] error resolviendo company_id', e?.message || String(e))
}

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <KpiWidget />
    <DebugConsole autoOpen={isDebugEnabled()} />
  </React.StrictMode>
)
