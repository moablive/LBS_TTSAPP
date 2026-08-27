<script setup lang="ts">
import UpdateBanner from './components/UpdateBanner.vue';
import VersionBadge from './components/VersionBadge.vue';
</script>

<template>
  <router-view />

  <!-- Fora do router-view de proposito: sobrevivem a troca de rota. -->
  <VersionBadge />
  <UpdateBanner />
</template>
