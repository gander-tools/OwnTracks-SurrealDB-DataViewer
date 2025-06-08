/// <reference types="vite/client" />

declare module 'libsodium-wrappers' {
  const sodium: any
  export default sodium
}

interface ImportMetaEnv {
  readonly VITE_SURREALDB_URL: string
  readonly VITE_SURREALDB_NAMESPACE: string
  readonly VITE_SURREALDB_DATABASE: string
  readonly VITE_SURREALDB_TABLE: string
  readonly VITE_SURREALDB_ENCRYPTED_FIELD: string
  readonly VITE_SURREALDB_DEVICE_FIELD: string
  readonly VITE_SURREALDB_TIMESTAMP_FIELD: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
