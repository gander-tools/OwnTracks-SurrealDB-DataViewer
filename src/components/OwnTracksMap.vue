<template>
  <div class="map-container">
    <div v-if="!hasData" class="no-data-message">
      No location data available. Decrypt data to view on map.
    </div>
    <div id="map" ref="mapRef" class="leaflet-map"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet icon issues with webpack
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix default icon
let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Define props for the component
const props = defineProps<{
  decryptedData: Record<string, any>[];
}>();

// Create refs for the map and map elements
const mapRef = ref<HTMLElement | null>(null);
const map = ref<L.Map | null>(null);
const pathLayers = ref<Record<string, L.Polyline>>({});
const markerLayers = ref<Record<string, L.LayerGroup>>({});

// Compute whether we have data to display
const hasData = computed(() => props.decryptedData.length > 0);

// Colors for different devices
const deviceColors = [
  '#FF5733', // Red-Orange
  '#33A8FF', // Blue
  '#33FF57', // Green
  '#FF33A8', // Pink
  '#A833FF', // Purple
  '#FFD133', // Yellow
  '#33FFD1', // Cyan
  '#D133FF', // Magenta
];

// Initialize the map
const initMap = () => {
  if (!mapRef.value) return;

  // Create the map if it doesn't exist
  if (!map.value) {
    map.value = L.map(mapRef.value).setView([0, 0], 2);

    // Add the tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map.value);
  }
};

// Clear all paths and markers from the map
const clearMap = () => {
  if (!map.value) return;

  // Remove all path layers
  Object.values(pathLayers.value).forEach(layer => {
    layer.remove();
  });
  pathLayers.value = {};

  // Remove all marker layers
  Object.values(markerLayers.value).forEach(layer => {
    layer.remove();
  });
  markerLayers.value = {};
};

// Draw paths on the map based on decrypted data
const drawPaths = () => {
  if (!map.value || !hasData.value) return;

  // Clear existing paths and markers
  clearMap();

  // Group data by device
  const deviceData: Record<string, any[]> = {};

  props.decryptedData.forEach(item => {
    // Skip items without lat/lon
    if (!item.lat || !item.lon) return;

    const deviceId = item.tid || item.device || 'unknown';
    if (!deviceData[deviceId]) {
      deviceData[deviceId] = [];
    }
    deviceData[deviceId].push(item);
  });

  // Sort each device's data by timestamp
  Object.keys(deviceData).forEach(deviceId => {
    deviceData[deviceId].sort((a, b) => {
      const timeA = a.tst || a.timestamp || 0;
      const timeB = b.tst || b.timestamp || 0;
      return timeA - timeB;
    });
  });

  // Draw paths for each device
  Object.keys(deviceData).forEach((deviceId, index) => {
    const points = deviceData[deviceId];
    if (points.length < 1) return;

    // Get color for this device (cycle through colors)
    const color = deviceColors[index % deviceColors.length];

    // Create path coordinates
    const coordinates = points.map(point => [point.lat, point.lon]);

    // Create polyline
    const polyline = L.polyline(coordinates as L.LatLngExpression[], {
      color,
      weight: 3,
      opacity: 0.7,
    }).addTo(map.value!);

    // Store the path layer
    pathLayers.value[deviceId] = polyline;

    // Create markers for each point
    const markerGroup = L.layerGroup().addTo(map.value!);
    markerLayers.value[deviceId] = markerGroup;

    points.forEach((point, i) => {
      const marker = L.circleMarker([point.lat, point.lon] as L.LatLngExpression, {
        radius: 5,
        color,
        fillColor: color,
        fillOpacity: 0.7,
      });

      // Add popup with information
      const timestamp = point.tst || point.timestamp;
      const time = timestamp ? new Date(timestamp * 1000).toLocaleString() : 'Unknown time';

      marker.bindPopup(`
        <strong>Device:</strong> ${deviceId}<br>
        <strong>Time:</strong> ${time}<br>
        <strong>Lat:</strong> ${point.lat}<br>
        <strong>Lon:</strong> ${point.lon}<br>
        ${point.alt ? `<strong>Alt:</strong> ${point.alt}m<br>` : ''}
        ${point.vel ? `<strong>Velocity:</strong> ${point.vel}km/h<br>` : ''}
        ${point.acc ? `<strong>Accuracy:</strong> ${point.acc}m<br>` : ''}
      `);

      marker.addTo(markerGroup);
    });

    // Fit map to show all paths if we have data
    if (Object.keys(pathLayers.value).length > 0) {
      const allPolylines = Object.values(pathLayers.value);
      const bounds = L.featureGroup(allPolylines).getBounds();
      map.value!.fitBounds(bounds, { padding: [30, 30] });
    }
  });
};

// Initialize map on component mount
onMounted(() => {
  initMap();
});

// Watch for changes in decrypted data
watch(() => props.decryptedData, () => {
  drawPaths();
}, { deep: true });
</script>

<style scoped>
.map-container {
  position: relative;
  width: 100%;
  height: 700px;
  margin: 20px 0;
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
}

.leaflet-map {
  width: 100%;
  height: 100%;
}

.no-data-message {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: rgba(245, 245, 245, 0.9);
  z-index: 1000;
  font-style: italic;
  color: #666;
}
</style>
