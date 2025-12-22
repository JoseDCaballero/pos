<template>
  <component :is="layout">
    <div class="app-header">
    </div>
    <router-view v-slot="{ Component }">
      <transition appear mode="out-in" name="side">
          <div :key="$route.fullPath">
              <component :is="Component"/>
          </div>
      </transition>
    </router-view>
  </component>
</template>

<script lang="ts">
import {LoginPage} from "./pages/index.js";

export default {
  computed: {
    LoginPage() {
      return LoginPage
    },
    layout() {
      return this.$route.meta.layout || 'div'
    }
  }
}
</script>

<style scoped>
.side-enter-active, .side-leave-active {
  transition: all .5s ease;
}

.side-enter-from, .side-leave-to {
  transform: translateY(100vh);
  opacity: 0;
}
</style>
