<template>
  <div class="owntracks-data">
    <!-- Credentials Form -->
    <CredentialsForm
      v-if="showCredentialsForm"
      @success="handleCredentialsSuccess"
      class="credentials-section"
    />

    <div v-else>
      <div class="credentials-status" v-if="credentialsStore.isLoaded">
        <div class="status-badge success">
          <span>Credentials Loaded</span>
        </div>
        <button @click="showCredentialsForm = true" class="btn btn-secondary btn-sm">
          Manage Credentials
        </button>
      </div>

      <div class="controls">
        <button
          @click="handleDisconnect"
          :disabled="!state.connected"
          class="btn btn-secondary"
        >
          Disconnect
        </button>

        <button
          @click="clearData"
          :disabled="state.data.length === 0"
          class="btn btn-warning"
        >
          Clear Data
        </button>
      </div>

      <div class="decryption-status" v-if="isDecrypting">
        <span>Decrypting data automatically...</span>
      </div>
    </div>

    <div v-if="state.loading" class="loading">
      Loading...
    </div>

    <div v-if="state.error" class="error">
      Error: {{ state.error }}
    </div>

    <div v-if="state.data.length > 0" class="data-section">
      <!-- Map section -->
      <div v-if="mapData.length > 0" class="map-section">
        <h3>OwnTracks Location Map ({{ mapData.length }} points)</h3>
        <OwnTracksMap :decrypted-data="mapData" />
      </div>

      <div v-else class="no-map-data">
        <p>No location data available for map display. Data will be automatically decrypted and displayed as it becomes available.</p>
      </div>
    </div>

    <div v-else-if="state.connected && !state.loading" class="no-data">
      No encrypted OwnTracks data found. You can use the filters and click "Fetch Data" to load data with specific criteria.
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useOwnTracks } from '../composables/useOwnTracks'
import type { OwnTracksData } from '../services/surreal'
import ownTracksCrypto from '../services/crypto'
import { useCredentialsStore } from '../stores/credentials'
import CredentialsForm from './CredentialsForm.vue'
import OwnTracksMap from './OwnTracksMap.vue'

const { state, connect, disconnect, fetchEncryptedData, clearData } = useOwnTracks()
const credentialsStore = useCredentialsStore()

const isDecrypting = ref(false)
const showCredentialsForm = ref(!credentialsStore.hasStoredCredentials() || !credentialsStore.isLoaded)

const decryptionResults = reactive<Map<string, { success: boolean; data?: string; error?: string }>>(new Map())

const handleCredentialsSuccess = () => {
  showCredentialsForm.value = false
}

const handleDisconnect = async () => {
  await disconnect()
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
  if (!contentValue || !item.id) return

  // Get decryption password from store
  if (!credentialsStore.isLoaded || !credentialsStore.credentials.decryptionPassword) return

  const password = credentialsStore.credentials.decryptionPassword

  const result = await ownTracksCrypto.decryptOwnTracksData(contentValue, password)

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



// Incremental decryption function
const startIncrementalDecryption = async () => {
  // Check if we have a decryption password
  if (!credentialsStore.isLoaded || !credentialsStore.credentials.decryptionPassword || state.data.length === 0) return

  isDecrypting.value = true

  try {
    // Clear previous results
    decryptionResults.clear()

    // Process items in batches to avoid blocking the UI
    const batchSize = 5
    let currentIndex = 0

    const processNextBatch = async () => {
      if (currentIndex >= state.data.length) {
        isDecrypting.value = false
        return
      }

      const endIndex = Math.min(currentIndex + batchSize, state.data.length)

      // Process a batch of items
      for (let i = currentIndex; i < endIndex; i++) {
        await tryDecryptItem(state.data[i])
      }

      currentIndex = endIndex

      // Schedule the next batch with a small delay to allow UI updates
      setTimeout(processNextBatch, 10)
    }

    // Start processing
    processNextBatch()
  } catch (error) {
    console.error('Error during incremental decryption:', error)
    isDecrypting.value = false
  }
}

// Watch for changes in state.data to start decryption automatically
watch(() => state.data, (newData) => {
  if (newData.length > 0) {
    startIncrementalDecryption()
  }
}, { immediate: false })

// Watch for credentials being loaded to automatically connect and fetch data
watch(() => credentialsStore.isLoaded, (isLoaded) => {
  if (isLoaded && !state.connected) {
    connect().then(() => {
      // Data is automatically fetched in the connect function
      console.log('Connected and fetched data automatically after credentials loaded')
    }).catch(error => {
      console.error('Error connecting after credentials loaded:', error)
    })
  }
}, { immediate: true })

// Transform decrypted data for the map component
const mapData = computed(() => {
  const result: Record<string, any>[] = [];

  // Only include items that have been successfully decrypted
  state.data.forEach(item => {
    if (item.id && decryptionResults.has(item.id) && decryptionResults.get(item.id)?.success) {
      try {
        // Parse the JSON data
        const decryptedData = JSON.parse(decryptionResults.get(item.id)?.data || '{}');

        // Add the device ID from the original item if available
        if (!decryptedData.device && getDeviceValue(item)) {
          decryptedData.device = getDeviceValue(item);
        }

        // Add to result if it has lat/lon coordinates
        if (decryptedData.lat && decryptedData.lon) {
          result.push(decryptedData);
        }
      } catch (error) {
        console.error('Error parsing decrypted data for map:', error);
      }
    }
  });

  // Reverse the order of the data to display in ASC order (oldest first)
  // Data is retrieved from SurrealDB in DESC order (newest first)
  return result.reverse();
});
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

.credentials-section {
  margin-bottom: 30px;
}

.credentials-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 15px;
  margin-bottom: 20px;
  padding: 10px;
  background-color: #f8f9fa;
  border-radius: 8px;
}

.status-badge {
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
}

.status-badge.success {
  background-color: #d4edda;
  color: #155724;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}

.decryption-info {
  background-color: #d1ecf1;
  color: #0c5460;
  padding: 8px 12px;
  border-radius: 4px;
  margin-bottom: 10px;
  font-size: 14px;
}

.decryption-status {
  background-color: #d4edda;
  color: #155724;
  padding: 8px 12px;
  border-radius: 4px;
  margin-bottom: 10px;
  font-size: 14px;
  display: inline-block;
}

.map-section {
  margin-bottom: 30px;
  background-color: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 4px 8px rgba(0,0,0,0.15);
  max-width: 100%;
  margin-left: auto;
  margin-right: auto;
}

.map-section h3 {
  margin-top: 0;
  margin-bottom: 15px;
  color: #28a745;
  text-align: center;
}

.no-map-data {
  background-color: #f8f9fa;
  border-radius: 8px;
  padding: 40px;
  text-align: center;
  color: #666;
  font-style: italic;
  margin: 20px 0;
  border: 1px solid #ddd;
}
</style>
