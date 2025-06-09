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

// Function to calculate bearing between two points
const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  // Convert to radians
  const startLat = lat1 * Math.PI / 180;
  const startLng = lon1 * Math.PI / 180;
  const destLat = lat2 * Math.PI / 180;
  const destLng = lon2 * Math.PI / 180;

  // Calculate bearing
  const y = Math.sin(destLng - startLng) * Math.cos(destLat);
  const x = Math.cos(startLat) * Math.sin(destLat) -
            Math.sin(startLat) * Math.cos(destLat) * Math.cos(destLng - startLng);
  let bearing = Math.atan2(y, x) * 180 / Math.PI;

  // Normalize to 0-360
  bearing = (bearing + 360) % 360;

  return bearing;
};

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

// Watch for data changes to reset view when data is cleared
watch(() => hasData.value, (newHasData) => {
  if (!newHasData && map.value) {
    // Reset to world view when data is cleared
    map.value.setView([0, 0], 2);
  }
});

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

  // Make sure the map is showing the world view first
  map.value.setView([0, 0], 2);

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
      // Calculate bearing based on previous and next points
      let bearing = 0;

      if (i < points.length - 1) {
        // If not the last point, use direction to next point
        bearing = calculateBearing(
          point.lat,
          point.lon,
          points[i + 1].lat,
          points[i + 1].lon
        );
      } else if (i > 0) {
        // If last point, use direction from previous point
        bearing = calculateBearing(
          points[i - 1].lat,
          points[i - 1].lon,
          point.lat,
          point.lon
        );
      }

      // Create an SVG arrow icon
      const arrowIcon = L.divIcon({
        html: `
          <svg width="16" height="16" viewBox="0 0 16 16" style="transform: rotate(${bearing}deg);">
            <polygon points="8,0 16,16 8,12 0,16" fill="${color}" stroke="black" stroke-width="1" />
          </svg>
        `,
        className: 'arrow-marker',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      // Create marker with arrow icon
      const marker = L.marker([point.lat, point.lon] as L.LatLngExpression, {
        icon: arrowIcon
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
        ${bearing ? `<strong>Direction:</strong> ${Math.round(bearing)}°<br>` : ''}
      `);

      marker.addTo(markerGroup);
    });
  });

  // Fit map to show all paths after a short delay to ensure the world view is seen first
  if (Object.keys(pathLayers.value).length > 0) {
    setTimeout(() => {
      const allPolylines = Object.values(pathLayers.value);
      const bounds = L.featureGroup(allPolylines).getBounds();
      map.value!.fitBounds(bounds, { padding: [30, 30] });
    }, 1000); // 1 second delay
  }
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

.arrow-marker {
  background: none;
  border: none;
}

.arrow-marker svg {
  filter: drop-shadow(0px 1px 2px rgba(0,0,0,0.5));
}
</style>
