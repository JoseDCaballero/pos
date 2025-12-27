<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from 'src/stores/auth';
import { socket } from 'src/boot/socket'
import { useQuasar } from 'quasar'
import { usePedidosStore, type Pedido, type PedidoBackend } from 'src/stores/pedidos-store'
import { storeToRefs } from 'pinia'

const $q = useQuasar()
const pedidosStore = usePedidosStore()
const { pedidos } = storeToRefs(pedidosStore)
const router = useRouter();
const leftDrawerOpen = ref(false);
const datos = ref<{ email?: string } | null>(null);
const authStore = useAuthStore();

function toggleLeftDrawer() {
  leftDrawerOpen.value = !leftDrawerOpen.value;
}

const cerrarSesion = async () => {
  const yes = confirm('¿Estás seguro de que deseas cerrar sesión?');
  if (yes) {
    authStore.logout();
    await router.push('/');
  }
}

// const cargarPedidos = async () => {
//   try {
//     await pedidosStore.obtenerPedidos()
//   } catch (error) {
//     console.error('Error cargando pedidos:', error)
//     $q.notify({
//       message: 'Error al cargar los pedidos',
//       color: 'negative',
//       icon: 'error',
//       position: 'top'
//     })
//   }
// }

onMounted(() => {
  datos.value = authStore.user;

  //void cargarPedidos()

  // Escuchar nuevos pedidos por socket
  socket.on('orden-recibida', (pedido: Pedido | PedidoBackend) => {
    console.log('Nuevo pedido recibido:', pedido)
    pedidosStore.agregarPedidoLocal(pedido)
    // Obtener el nombre del comprador independientemente del formato
    const comprador = pedido.comprador
    $q.notify({
      message: `¡Nuevo pedido de ${comprador}!`,
      color: 'positive',
      icon: 'shopping_cart',
      position: 'top-right',
      timeout: 5000,
      actions: [
        { label: 'Ver', color: 'white', handler: () => { void router.push('/caja') } }
      ]
    })
  })

  // Escuchar actualizaciones de pedidos
  socket.on('pedido-actualizado', (pedido: Pedido | PedidoBackend) => {
    console.log('Pedido actualizado:', pedido)
    const index = pedidos.value.findIndex(p => p.id === pedido.id)
    if (index !== -1) {
      // Si tiene DetallePedido, necesita transformación
      if ('DetallePedido' in pedido) {
        pedidosStore.agregarPedidoLocal(pedido)
        // Remover el pedido antiguo
        pedidos.value.splice(index, 1)
      } else {
        pedidos.value[index] = pedido as Pedido
      }
    }
  })
})

onUnmounted(() => {
  socket.off('orden-recibida')
  socket.off('pedido-actualizado')
})
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

          <q-item clickable to="/caja">
            <q-item-section avatar>
              <q-icon name="storefront" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Pedidos</q-item-label>
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

          <q-item clickable to="/caja">
            <q-item-section avatar>
              <q-icon name="storefront" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Pedidos</q-item-label>
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
