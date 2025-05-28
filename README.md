# OwnTracks 🔛 SurrealDB 🔛 Data Viewer

## Environment Configuration

Create a `.env` file in the root directory with the following variables:

```env
VITE_SURREALDB_URL="wss://your-surrealdb-instance.example.com/rpc"
VITE_SURREALDB_USERNAME=your_username
VITE_SURREALDB_PASSWORD="your-secure-password"
VITE_SURREALDB_NAMESPACE=your_namespace
VITE_SURREALDB_DATABASE=your_database
VITE_SURREALDB_TABLE=location_data
VITE_SURREALDB_ENCRYPTED_FIELD=content
VITE_SURREALDB_DEVICE_FIELD=device
VITE_SURREALDB_TIMESTAMP_FIELD=timestamp
```

## Installation and Usage

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run dev
```
