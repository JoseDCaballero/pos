<script stup lang="ts">
import { useQuasar } from 'quasar'
import { socket } from 'src/boot/socket'
import { onMounted } from 'vue'

const $q = useQuasar()

onMounted(() => {
  socket.on('orden-recibida', (pedido) => {
    $q.notify({
      message: `¡Nueva orden de la ${pedido.mesa}!`,
      color: 'positive',
      icon: 'shopping_cart',
      position: 'top-right',
      timeout: 5000
    })
    // Aquí puedes actualizar tu lista de órdenes pendientes en pantalla
  })
})
</script>

<template>
  <header class="header">
    <h1>Visualizacion de pedidos de clientes</h1>
  </header>
</template>
