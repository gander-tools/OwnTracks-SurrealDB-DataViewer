import { Surreal } from 'surrealdb'
import { useCredentialsStore } from '../stores/credentials'

export interface OwnTracksData {
  id?: string
  [key: string]: any
}

export interface TrackedDevice {
  id: string;
  name: string;
}

export interface Point {
  lat: number;
  lon: number;
  timestamp: number;
  [key: string]: any;
}

interface ConnectOptions {
  username?: string;
  password?: string;
}

class SurrealDBService {
  private db: Surreal
  private connected = false
  private liveQueries: Map<string, any> = new Map()

  constructor() {
    this.db = new Surreal()
  }

  async connect(options?: ConnectOptions): Promise<void> {
    try {
      // Get credentials from store
      const credentialsStore = useCredentialsStore();

      if (!credentialsStore.isLoaded) {
        throw new Error('No credentials available. Please set up your credentials first.');
      }

      // Get connection details from credentials store
      const url = credentialsStore.credentials.surrealUrl;
      await this.db.connect(url);

      const namespace = credentialsStore.credentials.surrealNamespace;
      const database = credentialsStore.credentials.surrealDatabase;

      await this.db.use({ namespace, database });

      // Get authentication credentials
      let username: string;
      let password: string;

      if (options?.username && options?.password) {
        // Use provided credentials
        username = options.username;
        password = options.password;
      } else {
        // Use credentials from store
        username = credentialsStore.credentials.username;
        password = credentialsStore.credentials.password;
      }

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
      const credentialsStore = useCredentialsStore();
      const tableName = credentialsStore.credentials.surrealTable;
      const encryptedField = import.meta.env.VITE_SURREALDB_ENCRYPTED_FIELD
      const timestampField = import.meta.env.VITE_SURREALDB_TIMESTAMP_FIELD

      const timeAgo = new Date();
      timeAgo.setMinutes(timeAgo.getMinutes() - 30);

      const query = `SELECT * FROM ${tableName} WHERE \`${encryptedField}\` IS NOT NULL AND \`${timestampField}\` >= <datetime>$fifteenMinutesAgo ORDER BY \`${timestampField}\` DESC`
      const result = await this.db.query(query, { fifteenMinutesAgo: timeAgo.toISOString() })

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
      const credentialsStore = useCredentialsStore();
      const tableName = credentialsStore.credentials.surrealTable;
      const encryptedField = import.meta.env.VITE_SURREALDB_ENCRYPTED_FIELD
      const deviceField = import.meta.env.VITE_SURREALDB_DEVICE_FIELD
      const timestampField = import.meta.env.VITE_SURREALDB_TIMESTAMP_FIELD

      const query = `SELECT * FROM ${tableName} WHERE \`${deviceField}\` = $deviceId AND \`${encryptedField}\` IS NOT NULL ORDER BY \`${timestampField}\` DESC LIMIT 1000`
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
      const credentialsStore = useCredentialsStore();
      const tableName = credentialsStore.credentials.surrealTable;
      const encryptedField = import.meta.env.VITE_SURREALDB_ENCRYPTED_FIELD
      const timestampField = import.meta.env.VITE_SURREALDB_TIMESTAMP_FIELD

      const query = `SELECT * FROM ${tableName} WHERE \`${timestampField}\` >= <datetime>$startDate AND \`${timestampField}\` <= <datetime>$endDate AND \`${encryptedField}\` IS NOT NULL ORDER BY \`${timestampField}\` DESC`
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
      const credentialsStore = useCredentialsStore();
      const tableName = credentialsStore.credentials.surrealTable;
      const encryptedField = import.meta.env.VITE_SURREALDB_ENCRYPTED_FIELD
      const deviceField = import.meta.env.VITE_SURREALDB_DEVICE_FIELD
      const timestampField = import.meta.env.VITE_SURREALDB_TIMESTAMP_FIELD

      let whereConditions = [`\`${encryptedField}\` IS NOT NULL`]
      const params: any = {}

      if (deviceId) {
        whereConditions.push(`\`${deviceField}\` = $deviceId`)
        params.deviceId = deviceId
      }

      if (startDate && endDate) {
        whereConditions.push(`\`${timestampField}\` >= <datetime>$startDate AND \`${timestampField}\` <= <datetime>$endDate`)
        params.startDate = startDate.toISOString()
        params.endDate = endDate.toISOString()
      }

      const query = `SELECT * FROM ${tableName} WHERE ${whereConditions.join(' AND ')} ORDER BY \`${timestampField}\` DESC LIMIT 1000`
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

  // Calculate distance between two points in meters using Haversine formula
  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance; // Distance in meters
  }

  // Get list of tracked devices
  async getTrackedDevices(): Promise<TrackedDevice[]> {
    if (!this.connected) {
      await this.connect();
    }

    try {
      const credentialsStore = useCredentialsStore();
      const tableName = credentialsStore.credentials.surrealTable;
      const deviceField = import.meta.env.VITE_SURREALDB_DEVICE_FIELD;

      const query = `SELECT \`${deviceField}\` as device FROM ${tableName} WHERE \`${deviceField}\` IS NOT NULL GROUP BY \`${deviceField}\``;

      console.log(query);

      const result = await this.db.query(query);

      // Map the result to match the expected TrackedDevice interface
      const devices = (result[0] as { device: string }[] || []).map((item: any) => ({
        id: item.device,
        name: item.device
      }));

      return devices as TrackedDevice[];
    } catch (error) {
      console.error('Failed to get tracked devices:', error);
      throw error;
    }
  }

  // Get last 5 points for a device
  async getLastPointsForDevice(deviceId: string, limit: number = 5): Promise<OwnTracksData[]> {
    if (!this.connected) {
      await this.connect();
    }

    try {
      const credentialsStore = useCredentialsStore();
      const tableName = credentialsStore.credentials.surrealTable;
      const encryptedField = import.meta.env.VITE_SURREALDB_ENCRYPTED_FIELD;
      const deviceField = import.meta.env.VITE_SURREALDB_DEVICE_FIELD;
      const timestampField = import.meta.env.VITE_SURREALDB_TIMESTAMP_FIELD;

      const query = `SELECT * FROM ${tableName} 
                    WHERE \`${deviceField}\` = $deviceId 
                    AND \`${encryptedField}\` IS NOT NULL 
                    ORDER BY \`${timestampField}\` DESC 
                    LIMIT $limit`;

      const result = await this.db.query(query, { deviceId, limit });

      return result[0] as OwnTracksData[] || [];
    } catch (error) {
      console.error(`Failed to get last points for device ${deviceId}:`, error);
      throw error;
    }
  }

  // Set up LIVE SELECT for a device
  async liveSelectForDevice(deviceId: string, callback: (data: OwnTracksData) => void): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }

    try {
      // Close existing live query for this device if it exists
      if (this.liveQueries.has(deviceId)) {
        await this.db.kill(this.liveQueries.get(deviceId));
        this.liveQueries.delete(deviceId);
      }

      const credentialsStore = useCredentialsStore();
      const tableName = credentialsStore.credentials.surrealTable;
      const encryptedField = import.meta.env.VITE_SURREALDB_ENCRYPTED_FIELD;
      const deviceField = import.meta.env.VITE_SURREALDB_DEVICE_FIELD;

      // Use the live method to set up the live query and subscribe to updates
      const liveQueryUuid = await this.db.live(
        tableName,
        (action, result) => {
          // Only process CREATE and UPDATE actions for the specific device
          if ((action === 'CREATE' || action === 'UPDATE') &&
              result[deviceField] === deviceId &&
              result[encryptedField] !== null) {
            callback(result as OwnTracksData);
          }
        }
      );

      // Store the live query UUID
      this.liveQueries.set(deviceId, liveQueryUuid);

    } catch (error) {
      console.error(`Failed to set up live select for device ${deviceId}:`, error);
      throw error;
    }
  }

  // Close all live queries
  async closeAllLiveQueries(): Promise<void> {
    for (const [deviceId, queryUuid] of this.liveQueries.entries()) {
      try {
        await this.db.kill(queryUuid);
        console.log(`Closed live query for device ${deviceId}`);
      } catch (error) {
        console.error(`Error closing live query for device ${deviceId}:`, error);
      }
    }
    this.liveQueries.clear();
  }
}

export const surrealService = new SurrealDBService()
export default surrealService
