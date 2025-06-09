import { ref, reactive } from 'vue'
import surrealService, { type OwnTracksData, type TrackedDevice, type Point } from '../services/surreal'

export interface OwnTracksState {
  data: OwnTracksData[]
  trackedDevices: TrackedDevice[]
  devicePoints: Record<string, OwnTracksData[]>
  filteredPoints: Record<string, OwnTracksData[]>
  loading: boolean
  error: string | null
  connected: boolean
  liveUpdatesActive: boolean
}

export function useOwnTracks() {
  const state = reactive<OwnTracksState>({
    data: [],
    trackedDevices: [],
    devicePoints: {},
    filteredPoints: {},
    loading: false,
    error: null,
    connected: false,
    liveUpdatesActive: false
  })

  const connect = async (): Promise<void> => {
    state.loading = true
    state.error = null

    try {
      await surrealService.connect()
      state.connected = true

      // Automatically fetch data after connecting
      await fetchEncryptedData()
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Failed to connect to SurrealDB'
      state.connected = false
    } finally {
      state.loading = false
    }
  }

  const disconnect = async (): Promise<void> => {
    try {
      await surrealService.disconnect()
      state.connected = false
      state.data = []
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Failed to disconnect from SurrealDB'
    }
  }

  const fetchEncryptedData = async (): Promise<void> => {
    state.loading = true
    state.error = null

    try {
      const data = await surrealService.queryEncryptedOwnTracksData()
      state.data = data
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Failed to fetch encrypted OwnTracks data'
      state.data = []
    } finally {
      state.loading = false
    }
  }

  const fetchEncryptedDataByDevice = async (deviceId: string): Promise<void> => {
    state.loading = true
    state.error = null

    try {
      const data = await surrealService.queryEncryptedOwnTracksDataByDevice(deviceId)
      state.data = data
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Failed to fetch encrypted OwnTracks data by device'
      state.data = []
    } finally {
      state.loading = false
    }
  }

  const fetchEncryptedDataByDateRange = async (startDate: Date, endDate: Date): Promise<void> => {
    state.loading = true
    state.error = null

    try {
      const data = await surrealService.queryEncryptedOwnTracksDataByDateRange(startDate, endDate)
      state.data = data
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Failed to fetch encrypted OwnTracks data by date range'
      state.data = []
    } finally {
      state.loading = false
    }
  }

  const fetchEncryptedDataWithFilters = async (deviceId?: string, startDate?: Date, endDate?: Date): Promise<void> => {
    state.loading = true
    state.error = null

    try {
      const data = await surrealService.queryEncryptedOwnTracksDataWithFilters(deviceId, startDate, endDate)
      state.data = data
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Failed to fetch encrypted OwnTracks data with filters'
      state.data = []
    } finally {
      state.loading = false
    }
  }

  const clearData = (): void => {
    state.data = []
    state.error = null
  }

  // Fetch tracked devices
  const fetchTrackedDevices = async (): Promise<void> => {
    state.loading = true
    state.error = null

    try {
      const devices = await surrealService.getTrackedDevices()
      state.trackedDevices = devices
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Failed to fetch tracked devices'
    } finally {
      state.loading = false
    }
  }

  // Fetch last points for all tracked devices
  const fetchLastPointsForAllDevices = async (limit: number = 5): Promise<void> => {
    if (state.trackedDevices.length === 0) {
      await fetchTrackedDevices()
    }

    state.loading = true
    state.error = null
    state.devicePoints = {}

    try {
      // Fetch points for each device
      for (const device of state.trackedDevices) {
        const points = await surrealService.getLastPointsForDevice(device.id, limit)
        state.devicePoints[device.id] = points
      }

      // Apply distance filter
      filterPointsByDistance()
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Failed to fetch last points for devices'
    } finally {
      state.loading = false
    }
  }

  // Filter points by distance (150m)
  const filterPointsByDistance = (maxDistance: number = 150): void => {
    state.filteredPoints = {}

    for (const [deviceId, points] of Object.entries(state.devicePoints)) {
      if (points.length === 0) continue

      // Start with the newest point
      const filteredPoints: OwnTracksData[] = [points[0]]

      // Process remaining points
      for (let i = 1; i < points.length; i++) {
        const currentPoint = points[i]
        const previousPoint = filteredPoints[filteredPoints.length - 1]

        // Extract lat/lon from decrypted data or use default values
        let currentLat = 0, currentLon = 0, prevLat = 0, prevLon = 0

        // This is a placeholder - in reality, we need to extract lat/lon from decrypted data
        // This will be handled in the OwnTracksData component where decryption happens

        // Calculate distance
        const distance = surrealService.calculateDistance(prevLat, prevLon, currentLat, currentLon)

        // Add point if distance is less than maxDistance
        if (distance <= maxDistance) {
          filteredPoints.push(currentPoint)
        }
      }

      state.filteredPoints[deviceId] = filteredPoints
    }
  }

  // Set up live updates for all tracked devices
  const setupLiveUpdates = async (): Promise<void> => {
    if (state.trackedDevices.length === 0) {
      await fetchTrackedDevices()
    }

    try {
      // Close any existing live queries
      await surrealService.closeAllLiveQueries()

      // Set up live queries for each device
      for (const device of state.trackedDevices) {
        await surrealService.liveSelectForDevice(device.id, (newPoint) => {
          handleNewPoint(device.id, newPoint)
        })
      }

      state.liveUpdatesActive = true
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Failed to set up live updates'
      state.liveUpdatesActive = false
    }
  }

  // Handle new point from live update
  const handleNewPoint = (deviceId: string, newPoint: OwnTracksData): void => {
    // Add new point to device points
    if (!state.devicePoints[deviceId]) {
      state.devicePoints[deviceId] = []
    }

    // Add to beginning (newest first)
    state.devicePoints[deviceId].unshift(newPoint)

    // Keep only the last 5 points
    if (state.devicePoints[deviceId].length > 5) {
      state.devicePoints[deviceId] = state.devicePoints[deviceId].slice(0, 5)
    }

    // Update filtered points
    filterPointsByDistance()
  }

  // Stop live updates
  const stopLiveUpdates = async (): Promise<void> => {
    try {
      await surrealService.closeAllLiveQueries()
      state.liveUpdatesActive = false
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Failed to stop live updates'
    }
  }

  return {
    state,
    connect,
    disconnect,
    fetchEncryptedData,
    fetchEncryptedDataByDevice,
    fetchEncryptedDataByDateRange,
    fetchEncryptedDataWithFilters,
    clearData,
    fetchTrackedDevices,
    fetchLastPointsForAllDevices,
    filterPointsByDistance,
    setupLiveUpdates,
    stopLiveUpdates
  }
}
