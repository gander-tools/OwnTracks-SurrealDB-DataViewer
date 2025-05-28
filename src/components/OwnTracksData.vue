<template>
  <div class="owntracks-data">
    <div class="controls">
      <button
        @click="handleConnect"
        :disabled="state.loading || state.connected"
        class="btn btn-primary"
      >
        {{ state.connected ? 'Connected' : 'Connect to SurrealDB' }}
      </button>

      <button
        @click="handleDisconnect"
        :disabled="!state.connected"
        class="btn btn-secondary"
      >
        Disconnect
      </button>

      <button
        @click="handleFetchWithFilters"
        :disabled="!state.connected || state.loading"
        class="btn btn-success"
      >
        Fetch Data
      </button>

      <button
        @click="clearData"
        :disabled="state.data.length === 0"
        class="btn btn-warning"
      >
        Clear Data
      </button>
    </div>

    <div class="filters" v-if="state.connected">
      <div class="filter-group">
        <label for="deviceId">Filter by Device ID:</label>
        <input
          id="deviceId"
          v-model="deviceId"
          type="text"
          placeholder="Enter device ID (optional)"
          class="input"
        />
      </div>

      <div class="filter-group">
        <label for="startDate">Date Range:</label>
        <input
          id="startDate"
          v-model="startDate"
          type="date"
          class="input"
        />
        <input
          v-model="endDate"
          type="date"
          class="input"
        />
      </div>

      <div class="filter-group">
        <label for="decryptionPassword">Decryption Password:</label>
        <input
          id="decryptionPassword"
          v-model="decryptionPassword"
          type="password"
          placeholder="Enter password to decrypt data (optional)"
          class="input"
        />
        <button
          @click="handleDecryptData"
          :disabled="!decryptionPassword || state.data.length === 0 || isDecrypting"
          class="btn btn-info"
        >
          {{ isDecrypting ? 'Decrypting...' : 'Decrypt Data' }}
        </button>
        <button
          @click="clearDecryption"
          :disabled="decryptionResults.size === 0"
          class="btn btn-secondary"
        >
          Clear Decryption
        </button>
      </div>
    </div>

    <div v-if="state.loading" class="loading">
      Loading...
    </div>

    <div v-if="state.error" class="error">
      Error: {{ state.error }}
    </div>

    <div v-if="state.data.length > 0" class="data-section">
      <h3>Encrypted OwnTracks Data ({{ state.data.length }} records)</h3>
      <div class="data-grid">
        <div
          v-for="(item, index) in state.data"
          :key="item.id || index"
          class="data-item"
        >
          <div class="data-header">
            <span class="id">ID: {{ item.id || 'N/A' }}</span>
            <span class="timestamp">{{ formatTimestamp(getTimestampValue(item)) }}</span>
          </div>
          <div class="device-id" v-if="getDeviceValue(item)">
            Device: {{ getDeviceValue(item) }}
          </div>
          <div class="encrypted-data">
            <div v-if="getDecryptedData(item)" class="decrypted-section">
              <strong>Decrypted Data:</strong>
              <pre class="json-data">{{ getDecryptedData(item) }}</pre>
            </div>
            <div v-else-if="hasDecryptionError(item)" class="decryption-error">
              <strong>Decryption Error:</strong>
              <span class="error-message">{{ getDecryptionError(item) }}</span>
            </div>
            <div v-else class="raw-encrypted">
              <strong>Encrypted Data:</strong>
              <pre class="encrypted-content">{{ getContentValue(item) }}</pre>
            </div>
          </div>
          <div class="metadata" v-if="hasMetadata(item)">
            <strong>Additional Fields:</strong>
            <ul>
              <li v-for="[key, value] in getMetadata(item)" :key="key">
                <strong>{{ key }}:</strong> {{ value }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="state.connected && !state.loading" class="no-data">
      No encrypted OwnTracks data found. Click "Fetch Data" to load data with optional filters.
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useOwnTracks } from '../composables/useOwnTracks'
import type { OwnTracksData } from '../services/surreal'
import ownTracksCrypto from '../services/crypto'

const { state, connect, disconnect, fetchEncryptedData, fetchEncryptedDataByDevice, fetchEncryptedDataByDateRange, fetchEncryptedDataWithFilters, clearData } = useOwnTracks()

const deviceId = ref('')
const startDate = ref('')
const endDate = ref('')
const decryptionPassword = ref('')
const isDecrypting = ref(false)

const decryptionResults = reactive<Map<string, { success: boolean; data?: string; error?: string }>>(new Map())

const handleConnect = async () => {
  await connect()
}

const handleDisconnect = async () => {
  await disconnect()
}

const handleFetchWithFilters = async () => {
  const device = deviceId.value.trim() || undefined
  let start: Date | undefined
  let end: Date | undefined

  if (startDate.value && endDate.value) {
    start = new Date(startDate.value)
    start.setHours(0, 0, 0, 0)

    end = new Date(endDate.value)
    end.setHours(23, 59, 59, 999)
  }

  await fetchEncryptedDataWithFilters(device, start, end)
}

const handleFetchData = async () => {
  await fetchEncryptedData()
}

const handleFetchByDevice = async () => {
  if (deviceId.value) {
    await fetchEncryptedDataByDevice(deviceId.value)
  }
}

const handleFetchByDateRange = async () => {
  if (startDate.value && endDate.value) {
    const start = new Date(startDate.value)
    start.setHours(0, 0, 0, 0)

    const end = new Date(endDate.value)
    end.setHours(23, 59, 59, 999)

    await fetchEncryptedDataByDateRange(start, end)
  }
}

const formatTimestamp = (timestamp: string | undefined): string => {
  if (!timestamp) return 'N/A'
  try {
    return new Date(timestamp).toLocaleString()
  } catch {
    return timestamp
  }
}

// Field accessor functions
const getDeviceValue = (item: OwnTracksData): string | undefined => {
  const deviceField = import.meta.env.VITE_SURREALDB_DEVICE_FIELD || 'device'
  return item[deviceField]
}

const getContentValue = (item: OwnTracksData): string | undefined => {
  const contentField = import.meta.env.VITE_SURREALDB_ENCRYPTED_FIELD || 'content'
  return item[contentField]
}

const getTimestampValue = (item: OwnTracksData): string | undefined => {
  const timestampField = import.meta.env.VITE_SURREALDB_TIMESTAMP_FIELD || 'timestamp'
  return item[timestampField]
}

const hasMetadata = (item: OwnTracksData): boolean => {
  const deviceField = import.meta.env.VITE_SURREALDB_DEVICE_FIELD || 'device'
  const contentField = import.meta.env.VITE_SURREALDB_ENCRYPTED_FIELD || 'content'
  const timestampField = import.meta.env.VITE_SURREALDB_TIMESTAMP_FIELD || 'timestamp'
  const excludeKeys = ['id', contentField, timestampField, deviceField]
  return Object.keys(item).some(key => !excludeKeys.includes(key))
}

const getMetadata = (item: OwnTracksData): [string, any][] => {
  const deviceField = import.meta.env.VITE_SURREALDB_DEVICE_FIELD || 'device'
  const contentField = import.meta.env.VITE_SURREALDB_ENCRYPTED_FIELD || 'content'
  const timestampField = import.meta.env.VITE_SURREALDB_TIMESTAMP_FIELD || 'timestamp'
  const excludeKeys = ['id', contentField, timestampField, deviceField]
  return Object.entries(item).filter(([key]) => !excludeKeys.includes(key))
}

// Decryption functions
const tryDecryptItem = async (item: OwnTracksData) => {
  const contentValue = getContentValue(item)
  if (!decryptionPassword.value || !contentValue || !item.id) return

  const result = await ownTracksCrypto.decryptOwnTracksData(contentValue, decryptionPassword.value)

  if (result.success && result.data) {
    decryptionResults.set(item.id, {
      success: true,
      data: ownTracksCrypto.formatJson(result.data)
    })
  } else {
    decryptionResults.set(item.id, {
      success: false,
      error: result.error || 'Unknown decryption error'
    })
  }
}

const getDecryptedData = (item: OwnTracksData): string | null => {
  if (!item.id) return null
  const result = decryptionResults.get(item.id)
  return result?.success ? result.data || null : null
}

const hasDecryptionError = (item: OwnTracksData): boolean => {
  if (!item.id) return false
  const result = decryptionResults.get(item.id)
  return result !== undefined && !result.success
}

const getDecryptionError = (item: OwnTracksData): string => {
  if (!item.id) return ''
  const result = decryptionResults.get(item.id)
  return result?.error || ''
}

// Manual decryption handlers
const handleDecryptData = async () => {
  if (!decryptionPassword.value || state.data.length === 0) return

  isDecrypting.value = true

  try {
    // Clear previous results
    decryptionResults.clear()

    // Try to decrypt all items
    for (const item of state.data) {
      await tryDecryptItem(item)
    }
  } finally {
    isDecrypting.value = false
  }
}

const clearDecryption = () => {
  decryptionResults.clear()
}
</script>

<style scoped>
.owntracks-data {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.controls {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  justify-content: center;
}

.filters {
  background: #f5f5f5;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.filter-group label {
  font-weight: bold;
  min-width: 120px;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background-color: #007bff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: #0056b3;
}

.btn-secondary {
  background-color: #6c757d;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background-color: #545b62;
}

.btn-success {
  background-color: #28a745;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background-color: #1e7e34;
}

.btn-warning {
  background-color: #ffc107;
  color: #212529;
}

.btn-warning:hover:not(:disabled) {
  background-color: #e0a800;
}

.btn-info {
  background-color: #17a2b8;
  color: white;
}

.btn-info:hover:not(:disabled) {
  background-color: #117a8b;
}

.input {
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.loading {
  text-align: center;
  font-size: 18px;
  color: #666;
  padding: 20px;
}

.error {
  background-color: #f8d7da;
  color: #721c24;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 20px;
}

.no-data {
  text-align: center;
  color: #666;
  padding: 40px;
  font-style: italic;
}

.data-section h3 {
  color: #333;
  margin-bottom: 15px;
}

.data-grid {
  display: grid;
  gap: 15px;
}

.data-item {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.data-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid #eee;
}

.id {
  font-weight: bold;
  color: #007bff;
}

.timestamp {
  color: #666;
  font-size: 12px;
}

.device-id {
  margin-bottom: 10px;
  color: #28a745;
  font-weight: 500;
}

.encrypted-data {
  margin-bottom: 10px;
}

.encrypted-data pre {
  background: #f8f9fa;
  padding: 10px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
  margin: 5px 0 0 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.metadata ul {
  margin: 5px 0 0 0;
  padding-left: 20px;
}

.metadata li {
  margin-bottom: 5px;
}

.decrypted-section {
  background: #e8f5e8;
  padding: 10px;
  border-radius: 4px;
  border-left: 4px solid #28a745;
}

.json-data {
  background: #f8f9fa;
  color: #2d3748;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 12px;
  line-height: 1.4;
}

.decryption-error {
  background: #ffe6e6;
  padding: 10px;
  border-radius: 4px;
  border-left: 4px solid #dc3545;
}

.error-message {
  color: #dc3545;
  font-weight: 500;
}

.raw-encrypted .encrypted-content {
  color: #6c757d;
  font-style: italic;
}

.filter-group {
  align-items: flex-start;
}

.filter-group label {
  display: block;
  margin-bottom: 5px;
}
</style>
