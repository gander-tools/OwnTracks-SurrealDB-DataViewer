import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import _sodium from 'libsodium-wrappers'

interface Credentials {
  username: string
  password: string
  decryptionPassword: string
  surrealUrl: string
  surrealNamespace: string
  surrealDatabase: string
  surrealTable: string
}

// Function to encrypt data using libsodium
async function encryptData(data: string, password: string): Promise<string> {
  await _sodium.ready
  const sodium = _sodium

  // Derive a key from the password
  const keyBuffer = new Uint8Array(sodium.crypto_secretbox_KEYBYTES)
  const passwordBytes = sodium.from_string(password)
  const copyLength = Math.min(passwordBytes.length, sodium.crypto_secretbox_KEYBYTES)
  keyBuffer.set(passwordBytes.slice(0, copyLength))

  // Generate a random nonce
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)

  // Encrypt the data
  const messageBytes = sodium.from_string(data)
  const ciphertext = sodium.crypto_secretbox_easy(messageBytes, nonce, keyBuffer)

  // Combine nonce and ciphertext and encode as base64
  const combined = new Uint8Array(nonce.length + ciphertext.length)
  combined.set(nonce)
  combined.set(ciphertext, nonce.length)

  return sodium.to_base64(combined, sodium.base64_variants.ORIGINAL)
}

// Function to decrypt data using libsodium
async function decryptData(encryptedData: string, password: string): Promise<string> {
  await _sodium.ready
  const sodium = _sodium

  // Derive a key from the password
  const keyBuffer = new Uint8Array(sodium.crypto_secretbox_KEYBYTES)
  const passwordBytes = sodium.from_string(password)
  const copyLength = Math.min(passwordBytes.length, sodium.crypto_secretbox_KEYBYTES)
  keyBuffer.set(passwordBytes.slice(0, copyLength))

  // Decode the base64 data
  const combined = sodium.from_base64(encryptedData, sodium.base64_variants.ORIGINAL)

  // Extract nonce and ciphertext
  const nonce = combined.slice(0, sodium.crypto_secretbox_NONCEBYTES)
  const ciphertext = combined.slice(sodium.crypto_secretbox_NONCEBYTES)

  // Decrypt the data
  const messageBytes = sodium.crypto_secretbox_open_easy(ciphertext, nonce, keyBuffer)

  return sodium.to_string(messageBytes)
}

export const useCredentialsStore = defineStore('credentials', {
  state: () => ({
    // Use useStorage to persist the encrypted data in localStorage
    encryptedData: useStorage('owntracks-credentials', ''),

    // In-memory state (not persisted)
    credentials: {
      username: '',
      password: '',
      decryptionPassword: '',
      surrealUrl: '',
      surrealNamespace: '',
      surrealDatabase: '',
      surrealTable: ''
    } as Credentials,

    isLoaded: false,
    error: null as string | null,
  }),

  actions: {
    async saveCredentials(credentials: Credentials, masterPassword: string) {
      try {
        // Store credentials in memory
        this.credentials = { ...credentials }

        // Encrypt and store in localStorage
        const dataStr = JSON.stringify(credentials)
        this.encryptedData = await encryptData(dataStr, masterPassword)

        this.isLoaded = true
        this.error = null

        return true
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to save credentials'
        return false
      }
    },

    async loadCredentials(masterPassword: string) {
      try {
        if (!this.encryptedData) {
          this.error = 'No stored credentials found'
          return false
        }

        // Decrypt the data
        const decryptedStr = await decryptData(this.encryptedData, masterPassword)
        const decryptedData = JSON.parse(decryptedStr) as Credentials

        // Store in memory
        this.credentials = decryptedData
        this.isLoaded = true
        this.error = null

        return true
      } catch (error) {
        this.error = 'Failed to decrypt credentials. Incorrect password?'
        this.isLoaded = false
        return false
      }
    },

    clearCredentials() {
      this.credentials = {
        username: '',
        password: '',
        decryptionPassword: '',
        surrealUrl: '',
        surrealNamespace: '',
        surrealDatabase: '',
        surrealTable: ''
      }
      this.encryptedData = ''
      this.isLoaded = false
      this.error = null
    },

    hasStoredCredentials() {
      return !!this.encryptedData
    }
  }
})
