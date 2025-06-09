import { ref, reactive } from 'vue'
import surrealService, { type OwnTracksData } from '../services/surreal'

export interface OwnTracksState {
  data: OwnTracksData[]
  loading: boolean
  error: string | null
  connected: boolean
}

export function useOwnTracks() {
  const state = reactive<OwnTracksState>({
    data: [],
    loading: false,
    error: null,
    connected: false
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

  return {
    state,
    connect,
    disconnect,
    fetchEncryptedData,
    fetchEncryptedDataByDevice,
    fetchEncryptedDataByDateRange,
    fetchEncryptedDataWithFilters,
    clearData
  }
}
