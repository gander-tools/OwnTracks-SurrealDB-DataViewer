import { Surreal } from 'surrealdb'

export interface OwnTracksData {
  id?: string
  [key: string]: any
}

class SurrealDBService {
  private db: Surreal
  private connected = false

  constructor() {
    this.db = new Surreal()
  }

  async connect(): Promise<void> {
    try {
      const url = import.meta.env.VITE_SURREALDB_URL
      await this.db.connect(url)

      const namespace = import.meta.env.VITE_SURREALDB_NAMESPACE
      const database = import.meta.env.VITE_SURREALDB_DATABASE

      await this.db.use({ namespace, database })

      const username = import.meta.env.VITE_SURREALDB_USERNAME
      const password = import.meta.env.VITE_SURREALDB_PASSWORD
      await this.db.signin({ username, password, namespace, database })

      this.connected = true
      console.log('Connected to SurrealDB')
    } catch (error) {
      console.error('Failed to connect to SurrealDB:', error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.db.close()
      this.connected = false
      console.log('Disconnected from SurrealDB')
    }
  }

  async queryEncryptedOwnTracksData(): Promise<OwnTracksData[]> {
    if (!this.connected) {
      await this.connect()
    }

    try {
      const tableName = import.meta.env.VITE_SURREALDB_TABLE
      const encryptedField = import.meta.env.VITE_SURREALDB_ENCRYPTED_FIELD
      const timestampField = import.meta.env.VITE_SURREALDB_TIMESTAMP_FIELD

      const query = `SELECT * FROM ${tableName} WHERE ${encryptedField} IS NOT NULL ORDER BY ${timestampField} DESC LIMIT 100`
      const result = await this.db.query(query)

      return result[0] as OwnTracksData[] || []
    } catch (error) {
      console.error('Failed to query encrypted OwnTracks data:', error)
      throw error
    }
  }

  async queryEncryptedOwnTracksDataByDevice(deviceId: string): Promise<OwnTracksData[]> {
    if (!this.connected) {
      await this.connect()
    }

    try {
      const tableName = import.meta.env.VITE_SURREALDB_TABLE
      const encryptedField = import.meta.env.VITE_SURREALDB_ENCRYPTED_FIELD
      const deviceField = import.meta.env.VITE_SURREALDB_DEVICE_FIELD
      const timestampField = import.meta.env.VITE_SURREALDB_TIMESTAMP_FIELD

      const query = `SELECT * FROM ${tableName} WHERE ${deviceField} = $deviceId AND ${encryptedField} IS NOT NULL ORDER BY ${timestampField} DESC LIMIT 100`
      const result = await this.db.query(query, { deviceId })

      return result[0] as OwnTracksData[] || []
    } catch (error) {
      console.error('Failed to query encrypted OwnTracks data by device:', error)
      throw error
    }
  }

  async queryEncryptedOwnTracksDataByDateRange(startDate: Date, endDate: Date): Promise<OwnTracksData[]> {
    if (!this.connected) {
      await this.connect()
    }

    try {
      const tableName = import.meta.env.VITE_SURREALDB_TABLE
      const encryptedField = import.meta.env.VITE_SURREALDB_ENCRYPTED_FIELD
      const timestampField = import.meta.env.VITE_SURREALDB_TIMESTAMP_FIELD

      const query = `SELECT * FROM ${tableName} WHERE ${timestampField} >= <datetime>$startDate AND ${timestampField} <= <datetime>$endDate AND ${encryptedField} IS NOT NULL ORDER BY ${timestampField} DESC`
      const params = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      }
      const result = await this.db.query(query, params)

      return result[0] as OwnTracksData[] || []
    } catch (error) {
      console.error('Failed to query encrypted OwnTracks data by date range:', error)
      throw error
    }
  }

  async queryEncryptedOwnTracksDataWithFilters(deviceId?: string, startDate?: Date, endDate?: Date): Promise<OwnTracksData[]> {
    if (!this.connected) {
      await this.connect()
    }

    try {
      const tableName = import.meta.env.VITE_SURREALDB_TABLE
      const encryptedField = import.meta.env.VITE_SURREALDB_ENCRYPTED_FIELD
      const deviceField = import.meta.env.VITE_SURREALDB_DEVICE_FIELD
      const timestampField = import.meta.env.VITE_SURREALDB_TIMESTAMP_FIELD

      let whereConditions = [`${encryptedField} IS NOT NULL`]
      const params: any = {}

      if (deviceId) {
        whereConditions.push(`${deviceField} = $deviceId`)
        params.deviceId = deviceId
      }

      if (startDate && endDate) {
        whereConditions.push(`${timestampField} >= <datetime>$startDate AND ${timestampField} <= <datetime>$endDate`)
        params.startDate = startDate.toISOString()
        params.endDate = endDate.toISOString()
      }

      const query = `SELECT * FROM ${tableName} WHERE ${whereConditions.join(' AND ')} ORDER BY ${timestampField} DESC LIMIT 100`
      const result = await this.db.query(query, params)

      return result[0] as OwnTracksData[] || []
    } catch (error) {
      console.error('Failed to query encrypted OwnTracks data with filters:', error)
      throw error
    }
  }

  isConnected(): boolean {
    return this.connected
  }
}

export const surrealService = new SurrealDBService()
export default surrealService
