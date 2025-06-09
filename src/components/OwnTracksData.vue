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

    <div class="data-section">
      <!-- Map section - always show the map -->
      <div class="map-section">
        <h3>OwnTracks Location Map {{ mapData.length > 0 ? `(${mapData.length} points)` : '' }}</h3>
        <OwnTracksMap :decrypted-data="mapData" />
      </div>

      <div v-if="state.data.length > 0 && mapData.length === 0" class="no-map-data">
        <p>No location data available for map display. Data will be automatically decrypted and displayed as it becomes available.</p>
      </div>
    </div>

    <div v-if="state.connected && !state.loading && state.data.length === 0" class="no-data">
      No encrypted OwnTracks data found. You can use the filters and click "Fetch Data" to load data with specific criteria.
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { useOwnTracks } from '../composables/useOwnTracks'
import type { OwnTracksData } from '../services/surreal'
import ownTracksCrypto from '../services/crypto'
import { useCredentialsStore } from '../stores/credentials'
import CredentialsForm from './CredentialsForm.vue'
import OwnTracksMap from './OwnTracksMap.vue'

const {
  state,
  connect,
  fetchEncryptedData,
  fetchTrackedDevices,
  fetchLastPointsForAllDevices,
  setupLiveUpdates,
  stopLiveUpdates
} = useOwnTracks()
const credentialsStore = useCredentialsStore()

const isDecrypting = ref(false)
const showCredentialsForm = ref(!credentialsStore.hasStoredCredentials() || !credentialsStore.isLoaded)
const MAX_DISTANCE = 150 // Maximum distance in meters

const decryptionResults = reactive<Map<string, { success: boolean; data?: string; error?: string }>>(new Map())

const handleCredentialsSuccess = () => {
  showCredentialsForm.value = false
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
    connect().then(async () => {
      try {
        // Fetch tracked devices
        await fetchTrackedDevices();
        console.log('Fetched tracked devices:', state.trackedDevices);

        // Fetch last 5 points for each device
        await fetchLastPointsForAllDevices(5);
        console.log('Fetched last points for all devices');

        // Set up live updates
        await setupLiveUpdates();
        console.log('Set up live updates for all devices');
      } catch (error) {
        console.error('Error fetching data after connection:', error);
      }
    }).catch(error => {
      console.error('Error connecting after credentials loaded:', error);
    });
  }
}, { immediate: true })

// Process device points for decryption
const processDevicePoints = () => {
  // Clear previous decryption results
  decryptionResults.clear();

  // Process all device points
  for (const deviceId in state.devicePoints) {
    const points = state.devicePoints[deviceId];
    for (const point of points) {
      if (point.id) {
        tryDecryptItem(point);
      }
    }
  }
};

// Watch for changes in device points to trigger decryption
watch(() => state.devicePoints, (newDevicePoints) => {
  if (Object.keys(newDevicePoints).length > 0) {
    processDevicePoints();
  }
}, { deep: true });

// Calculate distance between two decrypted points
const calculateDistance = (point1: any, point2: any): number => {
  if (!point1 || !point2 || !point1.lat || !point1.lon || !point2.lat || !point2.lon) {
    return Infinity;
  }

  return surrealService.calculateDistance(
    point1.lat,
    point1.lon,
    point2.lat,
    point2.lon
  );
};

// Filter points by distance
const filterPointsByDistance = (devicePoints: Record<string, any[]>): Record<string, any[]> => {
  const filteredPoints: Record<string, any[]> = {};

  for (const deviceId in devicePoints) {
    const points = devicePoints[deviceId];
    if (points.length === 0) continue;

    // Start with the newest point
    filteredPoints[deviceId] = [points[0]];

    // Process remaining points
    for (let i = 1; i < points.length; i++) {
      const currentPoint = getDecryptedPointData(points[i]);
      const previousPoint = getDecryptedPointData(filteredPoints[deviceId][filteredPoints[deviceId].length - 1]);

      // Calculate distance
      const distance = calculateDistance(previousPoint, currentPoint);

      // Add point if distance is less than MAX_DISTANCE
      if (distance <= MAX_DISTANCE) {
        filteredPoints[deviceId].push(points[i]);
      }
    }
  }

  return filteredPoints;
};

// Get decrypted point data
const getDecryptedPointData = (item: OwnTracksData): any => {
  if (!item.id || !decryptionResults.has(item.id) || !decryptionResults.get(item.id)?.success) {
    return null;
  }

  try {
    return JSON.parse(decryptionResults.get(item.id)?.data || '{}');
  } catch (error) {
    console.error('Error parsing decrypted data:', error);
    return null;
  }
};

// Transform decrypted data for the map component
const mapData = computed(() => {
  const result: Record<string, any>[] = [];
  const decryptedDevicePoints: Record<string, any[]> = {};

  // Process all device points
  for (const deviceId in state.devicePoints) {
    decryptedDevicePoints[deviceId] = [];

    for (const point of state.devicePoints[deviceId]) {
      if (point.id && decryptionResults.has(point.id) && decryptionResults.get(point.id)?.success) {
        try {
          // Parse the JSON data
          const decryptedData = JSON.parse(decryptionResults.get(point.id)?.data || '{}');

          // Add the device ID from the original item if available
          if (!decryptedData.device && getDeviceValue(point)) {
            decryptedData.device = getDeviceValue(point);
          }

          // Add to result if it has lat/lon coordinates
          if (decryptedData.lat && decryptedData.lon) {
            decryptedDevicePoints[deviceId].push({
              original: point,
              decrypted: decryptedData
            });
          }
        } catch (error) {
          console.error('Error parsing decrypted data for map:', error);
        }
      }
    }
  }

  // Filter points by distance
  const filteredDevicePoints = filterPointsByDistance(decryptedDevicePoints);

  // Flatten the filtered points
  for (const deviceId in filteredDevicePoints) {
    for (const point of filteredDevicePoints[deviceId]) {
      result.push(point.decrypted);
    }
  }

  // Reverse the order of the data to display in ASC order (oldest first)
  // Data is retrieved from SurrealDB in DESC order (newest first)
  return result.reverse();
});

// Clean up LIVE SELECT queries when component is unmounted
onUnmounted(async () => {
  try {
    await stopLiveUpdates();
    console.log('Stopped live updates on component unmount');
  } catch (error) {
    console.error('Error stopping live updates:', error);
  }
});
</script>

<style scoped>
.owntracks-data {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
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
