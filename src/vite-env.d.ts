/// <reference types="vite/client" />

declare module 'libsodium-wrappers' {
  const sodium: any
  export default sodium
}

interface ImportMetaEnv {
  readonly VITE_SURREALDB_ENCRYPTED_FIELD: string
  readonly VITE_SURREALDB_DEVICE_FIELD: string
  readonly VITE_SURREALDB_TIMESTAMP_FIELD: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
