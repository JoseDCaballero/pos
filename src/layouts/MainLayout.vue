<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const leftDrawerOpen = ref(false);
const datos = ref<{ email?: string } | null>(null);

function toggleLeftDrawer() {
  leftDrawerOpen.value = !leftDrawerOpen.value;
}

const cerrarSesion = async () => {
  const yes = confirm('¿Estás seguro de que deseas cerrar sesión?');
  if (yes){
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('user_data');
    await router.push('/');
  }
}

onMounted(() => {
  const datosString = sessionStorage.getItem('user_data');
  if (datosString) {
    datos.value = JSON.parse(datosString);
  }
});
</script>

<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated>
      <q-toolbar>
        <q-btn flat dense round icon="menu" aria-label="Menu" @click="toggleLeftDrawer" />

        <q-toolbar-title>
          Telas Emanuel
        </q-toolbar-title>

        <div v-if="datos">Usuario: {{ datos.email }}</div>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="leftDrawerOpen" show-if-above bordered>
      <q-list>
        <q-item-label header>
          Menú de opciones
        </q-item-label>
        <div v-if="datos?.email === 'caja'">
          <q-item clickable to="/carrito">
            <q-item-section avatar>
              <q-icon name="home" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Inicio</q-item-label>
            </q-item-section>
          </q-item>

          <q-item clickable to="/tienda">
            <q-item-section avatar>
              <q-icon name="store" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Categorías Tienda</q-item-label>
            </q-item-section>
          </q-item>

          <q-item clickable to="/bodega">
            <q-item-section avatar>
              <q-icon name="warehouse" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Categorías Bodega</q-item-label>
            </q-item-section>
          </q-item>

          <q-item clickable @click="cerrarSesion">
            <q-item-section avatar>
              <q-icon name="logout" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Cerrar sesión</q-item-label>
            </q-item-section>
          </q-item>
        </div>

        <div v-if="datos?.email === 'vendedor'">
          <q-item clickable to="/select">
            <q-item-section avatar>
              <q-icon name="home" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Inicio</q-item-label>
            </q-item-section>
          </q-item>

          <q-item clickable to="/tienda">
            <q-item-section avatar>
              <q-icon name="store" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Categorías Tienda</q-item-label>
            </q-item-section>
          </q-item>

          <q-item clickable to="/bodega">
            <q-item-section avatar>
              <q-icon name="warehouse" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Categorías Bodega</q-item-label>
            </q-item-section>
          </q-item>

          <q-item clickable @click="cerrarSesion">
            <q-item-section avatar>
              <q-icon name="logout" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Cerrar sesión</q-item-label>
            </q-item-section>
          </q-item>
        </div>
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>
