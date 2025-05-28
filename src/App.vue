<template>
  <div id="app">
    <main>
      <OwnTracksData />
    </main>
  </div>
</template>

<script setup lang="ts">
import OwnTracksData from './components/OwnTracksData.vue'
</script>

<style>
#app {
  font-family: Arial, sans-serif;
  margin: 0;
}

header {
  text-align: center;
  margin-bottom: 30px;
}

h1 {
  color: #2c3e50;
  margin: 5px auto;
}
</style>
