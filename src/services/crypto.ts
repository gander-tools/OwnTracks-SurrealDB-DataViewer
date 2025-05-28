import _sodium from 'libsodium-wrappers'

export interface DecryptionResult {
  success: boolean
  data?: any
  error?: string
}

class OwnTracksCrypto {
  private sodium: any = null
  private isReady = false

  async init(): Promise<void> {
    if (!this.isReady) {
      await _sodium.ready
      this.sodium = _sodium
      this.isReady = true
    }
  }

  async decryptOwnTracksData(encryptedData: string, secretKey: string): Promise<DecryptionResult> {
    await this.init()

    try {
      // Parse encrypted data if it's a JSON string
      let encryptedPayload: any
      if (typeof encryptedData === 'string') {
        try {
          encryptedPayload = JSON.parse(encryptedData)
        } catch (error) {
          // If it's not JSON, treat it as raw base64 data
          encryptedPayload = { data: encryptedData }
        }
      } else {
        encryptedPayload = encryptedData
      }

      // Check if payload has proper structure for OwnTracks encrypted format
      let base64Data: string
      if (encryptedPayload._type === "encrypted" && encryptedPayload.data) {
        base64Data = encryptedPayload.data
      } else if (encryptedPayload.data) {
        base64Data = encryptedPayload.data
      } else if (typeof encryptedData === 'string') {
        base64Data = encryptedData
      } else {
        return {
          success: false,
          error: 'Invalid encrypted payload format'
        }
      }

      // Prepare key - must be exactly 32 bytes (padded with zeros if needed)
      const keyBuffer = new Uint8Array(this.sodium.crypto_secretbox_KEYBYTES)
      const secretKeyBytes = this.sodium.from_string(secretKey)
      const copyLength = Math.min(secretKeyBytes.length, this.sodium.crypto_secretbox_KEYBYTES)
      keyBuffer.set(secretKeyBytes.slice(0, copyLength))

      // Decode Base64 data
      const encryptedBytes = this.sodium.from_base64(base64Data, this.sodium.base64_variants.ORIGINAL)

      // First 24 bytes are nonce, rest is ciphertext
      if (encryptedBytes.length < this.sodium.crypto_secretbox_NONCEBYTES) {
        return {
          success: false,
          error: 'Invalid encrypted data: too short'
        }
      }

      const nonce = encryptedBytes.slice(0, this.sodium.crypto_secretbox_NONCEBYTES)
      const ciphertext = encryptedBytes.slice(this.sodium.crypto_secretbox_NONCEBYTES)

      // Decrypt data
      const plaintext = this.sodium.crypto_secretbox_open_easy(ciphertext, nonce, keyBuffer)

      // Convert decrypted data to string and parse JSON
      const decryptedText = this.sodium.to_string(plaintext)
      const jsonData = JSON.parse(decryptedText)

      return {
        success: true,
        data: jsonData
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Decryption failed'
      }
    }
  }

  formatJson(data: any): string {
    try {
      return JSON.stringify(data, null, 2)
    } catch (error) {
      return 'Error formatting JSON: ' + (error instanceof Error ? error.message : 'Unknown error')
    }
  }
}

export const ownTracksCrypto = new OwnTracksCrypto()
export default ownTracksCrypto