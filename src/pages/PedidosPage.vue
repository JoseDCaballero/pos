<script setup lang="ts">
import { useQuasar } from 'quasar';
import { socket } from 'src/boot/socket';
import { onMounted, onUnmounted, ref } from 'vue';
import api from 'src/api/axios';
import { usePedidosStore, type Pedido, type PedidoBackend } from 'src/stores/pedidos-store';
import { storeToRefs } from 'pinia';
import { useAuthStore } from 'src/stores/auth';
import PaymentModal from 'src/components/PaymentModal.vue';

import { useRouter } from 'vue-router';

const $q = useQuasar();
const router = useRouter();
const pedidosStore = usePedidosStore();
const { pedidos } = storeToRefs(pedidosStore);
const cargando = ref(true);
const datos = ref<{ email?: string } | null>(null);
const authStore = useAuthStore();

const showPagoModal = ref(false);
const pedidoParaCompletar = ref<Pedido | null>(null);

const cargarPedidos = async () => {
  cargando.value = true;
  try {
    await pedidosStore.obtenerPedidos();
    console.log('--- DEBUG PEDIDOS PAGE ---');
    console.log('Pedidos cargados:', JSON.parse(JSON.stringify(pedidos.value)));
    pedidos.value.forEach((p) => {
      console.log(`Pedido #${p.id} - Total raw:`, p.total, 'Type:', typeof p.total);
    });
  } catch (error) {
    console.error('Error cargando pedidos:', error);
    $q.notify({
      message: 'Error al cargar los pedidos',
      color: 'negative',
      icon: 'error',
      position: 'top',
    });
  } finally {
    cargando.value = false;
  }
};

const completarPedido = (pedido: Pedido) => {
  console.log('Abriendo modal para pedido:', pedido);
  if (!pedido.id) return;
  pedidoParaCompletar.value = pedido;
  showPagoModal.value = true;
};

const editPedido = (pedido: Pedido) => {
  if (!pedido.id) return;

  const seleccion = (pedido.productos || []).map(p => ({
    id: 0, // placeholder for inventory id
    productoId: p.productoId,
    cantidadPedido: Number(p.cantidad),
    nombre: p.nombre,
    precio: 0,
    medida: p.medida
  }));

  const payload = {
    nombreCliente: pedido.comprador,
    seleccion,
    editOrderId: pedido.id
  };

  sessionStorage.setItem('pedido_temp', JSON.stringify(payload));
  void router.push('/tienda');
};

const confirmarPago = async (data: { montoPagado: number; comentarios: string; metodoPago: string }) => {
  console.log('Confirmando pago con data:', data);
  if (!pedidoParaCompletar.value || !pedidoParaCompletar.value.id) {
    console.error('No hay pedido para completar seleccionado');
    return;
  }

  const pedido = pedidoParaCompletar.value;
  showPagoModal.value = false;

  try {
    const detallesVenta = (pedido.productos || []).map((p) => {
      const cantidad = typeof p.cantidad === 'string' ? parseFloat(p.cantidad) : Number(p.cantidad);
      return {
        producto_id: Number(p.productoId),
        cantidad,
        precio_unitario: 0,
      };
    });

    const total =
      typeof pedido.total === 'number'
        ? pedido.total
        : pedido.total
          ? parseFloat(String(pedido.total))
          : 0;
    const totalCantidad = detallesVenta.reduce((s, d) => s + (Number(d.cantidad) || 0), 0);
    if (total > 0 && totalCantidad > 0) {
      const precioPorUnidad = total / totalCantidad;
      detallesVenta.forEach((d) => {
        d.precio_unitario = parseFloat(precioPorUnidad.toFixed(2));
      });
    }

    const payload = {
      cliente: pedido.comprador,
      total: total,
      detallesVenta,
      bodega_id: 1,
      comentarios: data.comentarios,
      metodo_pago: data.metodoPago
    };

    const response = await api.post('ventas', payload);

    if (response && (response.status === 201 || response.status === 200)) {
      await pedidosStore.actualizarEstadoPedido(pedido.id!, 'pagado');
      const vuelto = data.montoPagado - total;
      $q.notify({
        message: `Pedido completado. Cambio: $${vuelto.toFixed(2)}`,
        color: 'positive',
        icon: 'check_circle',
        position: 'top',
      });
    } else {
      throw new Error('Respuesta inesperada del servidor');
    }
  } catch (err: unknown) {
    console.error('Error completando pedido:', err);
    const extractErrorMessage = (e: unknown): string => {
      if (e instanceof Error) return e.message;
      if (typeof e === 'object' && e !== null) {
        const maybe = e as { response?: { data?: { error?: string } } };
        return maybe.response?.data?.error ?? JSON.stringify(maybe);
      }
      return String(e);
    };
    const msg = extractErrorMessage(err) || 'Error al completar el pedido';
    $q.notify({
      message: msg,
      color: 'negative',
      icon: 'error',
      position: 'top',
    });
  } finally {
    pedidoParaCompletar.value = null;
  }
};

const cancelarPedido = async (pedido: Pedido) => {
  if (!pedido.id) return;

  try {
    await pedidosStore.actualizarEstadoPedido(pedido.id, 'cancelado');
    $q.notify({
      message: 'Pedido cancelado',
      color: 'warning',
      icon: 'cancel',
      position: 'top',
    });
  } catch (error) {
    console.error('Error cancelando pedido:', error);
    $q.notify({
      message: 'Error al cancelar el pedido',
      color: 'negative',
      icon: 'error',
      position: 'top',
    });
  }
};

const formatearFecha = (fecha: string) => {
  const date = new Date(fecha);
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const pedidosPendientes = () => {
  return pedidos.value.filter((p) => p.estado === 'pendiente');
};

const pedidosCompletados = () => {
  return pedidos.value.filter((p) => p.estado === 'pagado');
};

const pedidosCancelados = () => {
  return pedidos.value.filter((p) => p.estado === 'cancelado');
};

onMounted(() => {
  datos.value = authStore.user;

  // Cargar pedidos existentes
  void cargarPedidos();

  // Escuchar nuevos pedidos por socket
  /*socket.on('orden-recibida', (pedido: Pedido) => {
    console.log('Nuevo pedido recibido:', pedido)
    pedidosStore.agregarPedidoLocal(pedido)
    $q.notify({
      message: `¡Nuevo pedido de ${pedido.comprador}!`,
      color: 'positive',
      icon: 'shopping_cart',
      position: 'top-right',
      timeout: 5000,
      actions: [
        { label: 'Ver', color: 'white', handler: async () => { await router.push('/pedidos') } }
      ]
    })
  })*/

  // Escuchar actualizaciones de pedidos
  socket.on('pedido-actualizado', (pedido: Pedido | PedidoBackend) => {
    console.log('Pedido actualizado:', pedido);
    const index = pedidos.value.findIndex((p) => p.id === pedido.id);
    if (index !== -1) {
      // Si tiene DetallePedido, necesita transformación
      if ('DetallePedido' in pedido) {
        pedidosStore.agregarPedidoLocal(pedido);
        // Remover el pedido antiguo
        pedidos.value.splice(index, 1);
      } else {
        pedidos.value[index] = pedido as Pedido;
      }
    }
  });
});

onUnmounted(() => {
  //socket.off('orden-recibida')
  socket.off('pedido-actualizado');
});
</script>

<template>
  <main class="pedidos-page">
    <header class="header">
      <h1>Pedidos de Clientes</h1>
      <button @click="cargarPedidos" class="btn-refresh" :disabled="cargando">
        <span v-if="cargando">Cargando...</span>
        <span v-else>🔄 Actualizar</span>
      </button>
    </header>

    <div v-if="cargando" class="loading">
      <div class="spinner"></div>
      <p>Cargando pedidos...</p>
    </div>

    <div v-else class="pedidos-container">
      <!-- Pedidos Pendientes -->
      <section class="pedidos-section">
        <h2 class="section-title">
          <span class="badge badge-pending">{{ pedidosPendientes().length }}</span>
          Pedidos Pendientes
        </h2>
        <div v-if="pedidosPendientes().length === 0" class="empty-state">
          No hay pedidos pendientes
        </div>
        <div v-else class="pedidos-grid">
          <div v-for="pedido in pedidosPendientes()" :key="pedido.id" class="pedido-card pending">
            <div class="pedido-header">
              <h3>Pedido #{{ pedido.id }}</h3>
              <span class="pedido-vendedor">{{ pedido.comprador }}</span>
            </div>
            <div class="pedido-fecha">{{ formatearFecha(pedido.fecha) }}</div>
            <div class="pedido-productos">
              <h4>Productos:</h4>
              <ul>
                <li v-for="(prod, idx) in pedido.productos" :key="idx">
                  <strong>{{ prod.nombre }}</strong>: {{ prod.cantidad }} {{ prod.medida }}
                </li>
              </ul>
            </div>
            <p class="pedido-total">Total: ${{ Number(pedido.total || 0).toFixed(2) }}</p>
            <div class="pedido-actions">
              <button v-if="datos?.email === 'caja'" @click="completarPedido(pedido)" class="btn-complete">
                ✓ Completar
              </button>
              <button v-if="datos?.email !== 'caja'" @click="editPedido(pedido)" class="btn-edit">
                ✎ Editar
              </button>
              <button @click="cancelarPedido(pedido)" class="btn-cancel">✕ Cancelar</button>
            </div>
          </div>
        </div>
      </section>

      <!-- Pedidos Completados -->
      <section class="pedidos-section">
        <h2 class="section-title">
          <span class="badge badge-completed">{{ pedidosCompletados().length }}</span>
          Pedidos Completados
        </h2>
        <div v-if="pedidosCompletados().length === 0" class="empty-state">
          No hay pedidos completados
        </div>
        <div v-else class="pedidos-grid">
          <div v-for="pedido in pedidosCompletados()" :key="pedido.id" class="pedido-card completed">
            <div class="pedido-header">
              <h3>Pedido #{{ pedido.id }}</h3>
              <span class="pedido-vendedor">{{ pedido.comprador }}</span>
            </div>
            <div class="pedido-fecha">{{ formatearFecha(pedido.fecha) }}</div>
            <div class="pedido-productos">
              <h4>Productos:</h4>
              <ul>
                <li v-for="(prod, idx) in pedido.productos" :key="idx">
                  <strong>{{ prod.nombre }}</strong>: {{ prod.cantidad }} {{ prod.medida }}
                </li>
              </ul>
            </div>
            <p class="pedido-total">Total: ${{ Number(pedido.total || 0).toFixed(2) }}</p>
            <div class="status-badge completed-badge">✓ Completado</div>
          </div>
        </div>
      </section>

      <!-- Pedidos Cancelados -->
      <section v-if="pedidosCancelados().length > 0" class="pedidos-section">
        <h2 class="section-title">
          <span class="badge badge-cancelled">{{ pedidosCancelados().length }}</span>
          Pedidos Cancelados
        </h2>
        <div class="pedidos-grid">
          <div v-for="pedido in pedidosCancelados()" :key="pedido.id" class="pedido-card cancelled">
            <div class="pedido-header">
              <h3>Pedido #{{ pedido.id }}</h3>
              <span class="pedido-vendedor">{{ pedido.comprador }}</span>
            </div>
            <div class="pedido-fecha">{{ formatearFecha(pedido.fecha) }}</div>
            <div class="pedido-productos">
              <h4>Productos:</h4>
              <ul>
                <li v-for="(prod, idx) in pedido.productos" :key="idx">
                  <strong>{{ prod.nombre }}</strong>: {{ prod.cantidad }} {{ prod.medida }}
                </li>
              </ul>
            </div>
            <p class="pedido-total">Total: ${{ Number(pedido.total || 0).toFixed(2) }}</p>
            <div class="status-badge cancelled-badge">✕ Cancelado</div>
          </div>
        </div>
      </section>
    </div>

    <PaymentModal v-if="showPagoModal" :show="true" :total="Number(pedidoParaCompletar?.total || 0)"
      :clientName="pedidoParaCompletar?.comprador" :initialComments="pedidoParaCompletar?.comentarios || ''"
      @close="showPagoModal = false" @confirm="confirmarPago" />
  </main>
</template>

<style scoped>
.pedidos-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  padding: 2rem;
  font-family: 'Segoe UI', Arial, sans-serif;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  background: white;
  padding: 1.5rem 2rem;
  border-radius: 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.07);
}

.header h1 {
  margin: 0;
  font-size: 2rem;
  color: #333;
  font-weight: 700;
}

.btn-refresh {
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #ffd54f 0%, #8b5e3c 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-refresh:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem;
  gap: 1rem;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 5px solid #f3f3f3;
  border-top: 5px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.pedidos-container {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.pedidos-section {
  background: white;
  border-radius: 16px;
  padding: 2rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.07);
}

.section-title {
  font-size: 1.5rem;
  color: #333;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 0.75rem;
  border-radius: 16px;
  font-size: 0.9rem;
  font-weight: 700;
  color: white;
}

.badge-pending {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.badge-completed {
  background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
}

.badge-cancelled {
  background: linear-gradient(135deg, #757575 0%, #616161 100%);
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: #999;
  font-size: 1.1rem;
}

.pedidos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;
}

.pedido-card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.2s;
  position: relative;
  border-left: 4px solid;
}

.pedido-card.pending {
  border-left-color: #f5576c;
}

.pedido-card.completed {
  border-left-color: #4caf50;
  opacity: 0.8;
}

.pedido-card.cancelled {
  border-left-color: #757575;
  opacity: 0.6;
}

.pedido-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
}

.pedido-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.pedido-header h3 {
  margin: 0;
  font-size: 1.25rem;
  color: #333;
}

.pedido-vendedor {
  background: linear-gradient(135deg, #ffd54f 0%, #8b5e3c 100%);
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 600;
}

.pedido-fecha {
  color: #666;
  font-size: 0.9rem;
  margin-bottom: 1rem;
}

.pedido-productos {
  margin-bottom: 1rem;
}

.pedido-productos h4 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
  color: #555;
}

.pedido-productos ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.pedido-productos li {
  padding: 0.5rem;
  background: #f8f9fa;
  border-radius: 6px;
  margin-bottom: 0.5rem;
  font-size: 0.95rem;
}

.pedido-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
}

.btn-complete,
.btn-edit {
  background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
  color: white;
}

.btn-edit:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(33, 150, 243, 0.4);
}

.btn-cancel {
  flex: 1;
  padding: 0.75rem;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.95rem;
}

.btn-complete {
  background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
  color: white;
}

.btn-complete:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
}

.btn-cancel {
  background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);
  color: white;
}

.btn-cancel:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(244, 67, 54, 0.4);
}

.status-badge {
  margin-top: 1rem;
  padding: 0.5rem;
  border-radius: 8px;
  text-align: center;
  font-weight: 600;
  font-size: 0.9rem;
}

.completed-badge {
  background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
  color: white;
}

.cancelled-badge {
  background: linear-gradient(135deg, #757575 0%, #616161 100%);
  color: white;
}

@media (max-width: 768px) {
  .pedidos-page {
    padding: 1rem;
  }

  .header {
    flex-direction: column;
    gap: 1rem;
    text-align: center;
  }

  .pedidos-grid {
    grid-template-columns: 1fr;
  }
}

.pedido-total {
  font-size: 1.1rem;
  font-weight: 700;
  color: #333;
  margin: 1rem 0;
  text-align: right;
  border-top: 1px solid #eee;
  padding-top: 0.5rem;
}
</style>
