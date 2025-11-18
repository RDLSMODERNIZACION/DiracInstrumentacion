/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_API_KEY?: string
  readonly VITE_WS_URL?: string
  readonly VITE_ORG_ID?: string
  readonly VITE_STALE_WARN_SEC?: string
  readonly VITE_STALE_CRIT_SEC?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
