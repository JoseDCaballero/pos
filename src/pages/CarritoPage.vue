<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import api from 'src/api/axios';
import { usePedidosStore } from 'src/stores/pedidos-store';
import { useQuasar } from 'quasar';
import PaymentModal from 'src/components/PaymentModal.vue';
import { socket } from 'src/boot/socket';
import type ReceiptPrinter from 'src/components/ReceiptPrinter.vue';
import type { ReceiptData } from 'src/components/types';
import { openCashDrawer, simulateCashDrawer } from 'src/utils/cashDrawer';

interface Producto {
  id: number;
  producto_id?: number | undefined;
  bodega_id?: number;
  nombre?: string;
  precio?: number;
  precio_tap?: number;
  medida_ind?: string | undefined;
  cantidad?: number | undefined;
}

interface InventarioItem {
  id: number;
  bodega_id: number;
  producto_id?: number;
  producto?: {
    id?: number;
    nombre: string;
    precio?: number;
    precio_tap?: number;
  };
  cantidad?: number | undefined;
  precio?: number;
  precio_tap?: number;
  medida_ind?: string;
}

interface ItemCarrito {
  productoId: number;
  bodega_id: number;
  nombre: string;
  cantidad: number;
  medida: string;
  precio?: number;
  precio_tap?: number;
  stock: number;
}

const $q = useQuasar();
const pedidosStore = usePedidosStore();

const term = ref('');
const sugerencias = ref<Producto[]>([]);
const buscando = ref(false);

const carrito = ref<ItemCarrito[]>([]);
const cliente = ref('');
const enviando = ref(false);
const showPagoModal = ref(false);
const comentarios = ref('');
const esPrecioTap = ref(false);
const receiptPrinter = ref<InstanceType<typeof ReceiptPrinter> | null>(null);
const currentReceipt = ref<ReceiptData | null>(null);

const buscar = async (valor: string) => {
  if (!valor) {
    sugerencias.value = [];
    return;
  }
  buscando.value = true;
  try {
    const res = await api.get('inventarios');
    const items = Array.isArray(res.data) ? res.data : (res.data.items ?? []);

    const q = valor.toLowerCase();

    // Type definition for the inventory item structure based on ProdsTiePage
    // CRITICAL: Filter by bodega_id === 1 to prevent phantom products from other bodegas
    sugerencias.value = (items as InventarioItem[])
      .filter((p) => p.bodega_id === 1) // Filter by bodega like in ProdsTiePage
      .filter((p) => {
        const nombre = p.producto?.nombre ?? '';
        return nombre.toLowerCase().includes(q);
      })
      .map((p) => ({
        id: p.id,
        producto_id: p.producto_id ?? p.producto?.id,
        bodega_id: p.bodega_id, // Include bodega_id for cart tracking
        nombre: p.producto?.nombre || 'Producto',
        precio: Number(p.precio ?? p.producto?.precio ?? 0),
        precio_tap: Number(p.precio_tap ?? p.producto?.precio_tap ?? 0),
        medida_ind: p.medida_ind || 'X',
        cantidad: Number(p.cantidad ?? 0),
      }))
      .slice(0, 12);
  } catch (err) {
    console.error('Error buscando productos', err);
    sugerencias.value = [];
  } finally {
    buscando.value = false;
  }
};

const onTermInput = (e: Event) => {
  const el = e.target as HTMLInputElement | null;
  const v = el ? el.value : '';
  term.value = v;
  void buscar(v);
};

const agregarAlCarrito = (p: Producto) => {
  const pid = Number(p.producto_id ?? p.id);
  const existente = carrito.value.find((i) => i.productoId === pid);
  const stockDisponible = Number(p.cantidad ?? 0);

  if (existente) {
    if (existente.cantidad < existente.stock) {
      existente.cantidad = existente.cantidad + 0.5;
    } else {
      $q.notify({ message: 'No hay más existencias disponibles', color: 'orange' });
    }
  } else {
    if (stockDisponible <= 0) {
      $q.notify({ message: 'Producto agotado', color: 'negative' });
      return;
    }
    const item = {
      productoId: pid,
      bodega_id: p.bodega_id ?? 1, // Default to bodega 1
      nombre: p.nombre || 'Producto',
      cantidad: 0.5,
      medida: p.medida_ind || 'UNID',
      stock: stockDisponible,
      precio: Number(p.precio ?? 0),
      precio_tap: Number(p.precio_tap ?? 0),
    };
    carrito.value.push(item as ItemCarrito);
  }
  term.value = '';
  sugerencias.value = [];
};

const fmt = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '--';
};

const quitar = (id: number) => {
  carrito.value = carrito.value.filter((i) => i.productoId !== id);
};

const actualizarCantidad = (id: number, cantidad: number) => {
  const it = carrito.value.find((i) => i.productoId === id);
  if (!it) return;

  // Validar contra stock
  const nuevaCantidad = Math.min(cantidad, it.stock);
  if (cantidad > it.stock) {
    $q.notify({
      message: `Solo hay ${it.stock} unidades disponibles`,
      color: 'orange',
      position: 'top',
      timeout: 1000,
    });
  }

  it.cantidad = nuevaCantidad <= 0 ? 0 : nuevaCantidad;
};

const subtotal = computed(() =>
  carrito.value.reduce((s, i) => {
    const p = esPrecioTap.value ? Number(i.precio_tap ?? 0) : Number(i.precio ?? 0);
    return s + p * i.cantidad;
  }, 0),
);
const total = computed(() => +subtotal.value.toFixed(2));

const enviar = async (extra: { comprador?: string } = {}) => {
  if (!carrito.value.length) {
    $q.notify({ message: 'El carrito está vacío', color: 'warning' });
    return;
  }
  enviando.value = true;
  try {
    const pedido = {
      comprador: (extra.comprador ?? cliente.value ?? '').trim() || 'Cliente',
      productos: carrito.value.map((i) => ({
        productoId: i.productoId,
        nombre: i.nombre,
        cantidad: i.cantidad,
        medida: i.medida,
      })),
      estado: 'pendiente' as const,
    };
    // Log payload for debugging server errors
    //console.log('Enviando pedido payload:', pedido)
    const creado = await pedidosStore.agregarPedido(pedido);

    // Notificar por socket para que otros clientes muestren la notificación
    socket.emit('nuevo-pedido', creado);
    $q.notify({ message: 'Cobro exitoso', color: 'positive' });
    carrito.value = [];
    cliente.value = '';
    sessionStorage.removeItem(import.meta.env.VITE_STORAGE_KEY);
    return creado;
  } catch (err: unknown) {
    const maybe = err as { response?: { data?: unknown }; message?: string };
    console.error('Error creando pedido', err, maybe.response?.data ?? null);
    const data = maybe.response?.data;
    let serverError: string | undefined;
    if (
      typeof data === 'object' &&
      data !== null &&
      'error' in data &&
      typeof (data as Record<string, unknown>).error === 'string'
    ) {
      serverError = (data as Record<string, unknown>).error as string;
    }
    const msg = serverError ?? maybe.message ?? 'Error al crear pedido';
    $q.notify({ message: String(msg), color: 'negative' });
  } finally {
    enviando.value = false;
  }
};

const abrirModalPago = () => {
  showPagoModal.value = true;
};

const confirmarPago = async (data: { montoPagado: number; comentarios: string; metodoPago: string }) => {
  showPagoModal.value = false;
  const { montoPagado: mp, comentarios: cs, metodoPago: mpago } = data;
  comentarios.value = cs;
  // Construir detallesVenta a partir del carrito antes de enviarlo
  // CRITICAL: Use precio_tap when toggle is active, otherwise use precio
  const detallesVenta = carrito.value.map((i) => ({
    producto_id: Number(i.productoId),
    cantidad: Number(i.cantidad),
    precio_unitario: esPrecioTap.value ? Number(i.precio_tap ?? 0) : Number(i.precio ?? 0),
  }));

  try {
    // Crear pedido en la base de datos
    const creado = await enviar({ comprador: cliente.value });

    if (!creado || !creado.id) {
      throw new Error('No se pudo crear el pedido antes de procesar la venta');
    }

    const payload = {
      cliente: cliente.value || 'Cliente',
      total: Number(total.value),
      detallesVenta,
      bodega_id: 1,
      comentarios: comentarios.value,
      metodo_pago: mpago,
    };

    /*console.log('--- DEBUG TOTAL ---');
    console.log('Carrito:', JSON.parse(JSON.stringify(carrito.value)));
    console.log('Subtotal value:', subtotal.value);
    console.log('Total computed value:', total.value);
    console.log('--- DEBUG PRECIO_TAP ---');
    console.log('esPrecioTap toggle:', esPrecioTap.value);
    console.log('detallesVenta (with prices):', JSON.parse(JSON.stringify(detallesVenta)));
    console.log('Payload enviado:', payload);*/

    const resp = await api.post('ventas', payload);

    if (resp && (resp.status === 200 || resp.status === 201)) {
      // Marcar pedido como pagado
      await pedidosStore.actualizarEstadoPedido(creado.id, 'pagado');
      const vuelto = +(mp - Number(total.value)).toFixed(2);

      // Print receipt automatically
      currentReceipt.value = {
        cliente: cliente.value || 'Cliente',
        productos: carrito.value.map(i => ({
          cantidad: i.cantidad,
          medida: i.medida,
          nombre: i.nombre,
          precio_unitario: esPrecioTap.value ? Number(i.precio_tap ?? 0) : Number(i.precio ?? 0)
        })),
        total: Number(total.value),
        metodoPago: mpago,
        fecha: new Date().toISOString(),
        ...(comentarios.value ? { comentarios: comentarios.value } : {}),
        ...(vuelto > 0 ? { cambio: vuelto } : {})
      };

      // Trigger print
      setTimeout(() => {
        receiptPrinter.value?.print();
      }, 500);

      // Open cash drawer after successful payment
      setTimeout(() => {
        simulateCashDrawer(); // Simulate with sound
        // Uncomment the line below if you have a real ESC/POS printer connected:
        openCashDrawer().catch(() => simulateCashDrawer());
      }, 1500);

      $q.notify({ message: `Cambio: ${vuelto.toFixed(2)}`, color: 'info' });
    } else {
      throw new Error('Respuesta inesperada del servidor al procesar la venta');
    }
  } catch (err) {
    console.error('Error procesando pago:', err);
    const msg = err instanceof Error ? err.message : 'Error procesando el pago';
    $q.notify({ message: msg, color: 'negative' });
  }
};

const cancelar = () => {
  carrito.value = [];
  cliente.value = '';
  sessionStorage.removeItem(import.meta.env.VITE_STORAGE_KEY);
  $q.notify({ message: 'Pedido cancelado', color: 'info' });
};

const guardar = () => {
  try {
    sessionStorage.setItem(
      import.meta.env.VITE_STORAGE_KEY,
      JSON.stringify({ carrito: carrito.value }),
    );
  } catch (err) {
    console.error('Error guardando carrito', err);
  }
};

const restaurar = () => {
  try {
    const raw = sessionStorage.getItem(import.meta.env.VITE_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    // CRITICAL: Filter out phantom products from other bodegas when restoring
    const restoredCart = data?.carrito || [];
    carrito.value = restoredCart.filter((item: ItemCarrito) => item.bodega_id === 1);

    // If we filtered out items, save the cleaned cart back to sessionStorage
    if (restoredCart.length !== carrito.value.length) {
      console.log(`Filtered out ${restoredCart.length - carrito.value.length} phantom products from sessionStorage`);
      guardar();
    }
  } catch (err) {
    console.error('Error restaurando carrito', err);
  }
};

watch(carrito, () => guardar(), { deep: true });

onMounted(() => {
  restaurar();
});
</script>

<template>
  <main class="pos-container">
    <div class="pos-layout">
      <!-- Columna Izquierda: Búsqueda -->
      <div class="search-panel">
        <div class="search-wrapper">
          <input v-model="term" @input="onTermInput" class="search-input" placeholder="Buscar productos..."
            type="text" />
          <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
        </div>

        <div class="suggestions-container">
          <div v-if="buscando" class="loading-state">
            <div class="spinner"></div>
            <span>Buscando...</span>
          </div>

          <div v-else-if="sugerencias.length" class="suggestions-list">
            <div v-for="producto in sugerencias" :key="producto.id" class="producto-card"
              @click="agregarAlCarrito(producto)">
              <div class="producto-info">
                <h3 class="producto-nombre">{{ producto.nombre }}</h3>
                <span class="producto-linea">Existencia: {{ producto.cantidad }} {{ producto.medida_ind }}</span>
              </div>
              <div class="producto-precio">
                <span v-if="esPrecioTap" class="price-original">${{ fmt(producto.precio) }}</span>
                <span>${{ fmt(esPrecioTap ? producto.precio_tap : producto.precio) }}</span>
              </div>
            </div>
          </div>

          <div v-else-if="term" class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            <p>No se encontraron productos</p>
          </div>

          <div v-else class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 16v-4M12 8h.01"></path>
            </svg>
            <p>Busca productos para agregar al carrito</p>
          </div>
        </div>
      </div>

      <!-- Columna Central: Carrito -->
      <div class="cart-panel">
        <div class="cart-header">
          <div>
            <h2>Carrito de compra</h2>
            <span class="item-count">{{ carrito.length }} productos</span>
          </div>
          <div class="header-actions">
            <q-toggle v-model="esPrecioTap" label="Precio Tapicero" color="brown" left-label
              class="precio-tap-toggle" />
          </div>
        </div>

        <div class="cart-content">
          <div v-if="carrito.length" class="cart-items">
            <div v-for="item in carrito" :key="item.productoId" class="cart-item">
              <div class="item-details">
                <h4 class="item-nombre">{{ item.nombre }}</h4>
                <!--<span class="item-medida">{{ item.cantidad }} {{ item.medida }}</span>-->
              </div>

              <div class="item-controls">
                <div class="quantity-control">
                  <button class="qty-btn" @click="actualizarCantidad(item.productoId, item.cantidad - 0.5)"
                    :disabled="item.cantidad <= 0.5">
                    -
                  </button>
                  <input type="number" class="qty-input" v-model.number="item.cantidad"
                    @change="actualizarCantidad(item.productoId, item.cantidad)" min="0.5" :max="item.stock" />
                  <span class="item-medida">{{ item.medida }}</span>
                  <button class="qty-btn" @click="actualizarCantidad(item.productoId, item.cantidad + 0.5)"
                    :disabled="item.cantidad >= item.stock">
                    +
                  </button>
                </div>

                <div class="item-pricing">
                  <span class="item-precio">${{ fmt(esPrecioTap ? item.precio_tap : item.precio) }}</span>
                  <span class="item-total">${{ fmt((esPrecioTap ? Number(item.precio_tap) : Number(item.precio)) *
                    item.cantidad) }}</span>
                </div>

                <button class="delete-btn" @click="quitar(item.productoId)">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2">
                    </path>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div v-else class="empty-cart">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="9" cy="21" r="1"></circle>
              <circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
            <h3>Carrito vacío</h3>
            <p>Agrega productos desde la búsqueda</p>
          </div>
        </div>
      </div>

      <!-- Columna Derecha: Resumen -->
      <div class="summary-panel">
        <div class="summary-card">
          <h3 class="summary-title">Resumen</h3>

          <div class="summary-divider"></div>

          <div class="summary-rows">
            <div class="summary-row">
              <span>Subtotal</span>
              <span>${{ subtotal.toFixed(2) }}</span>
            </div>
          </div>

          <div class="summary-divider"></div>

          <div class="summary-total">
            <span>Total</span>
            <span class="total-amount">${{ total.toFixed(2) }}</span>
          </div>

          <div class="action-buttons">
            <button class="btn-primary" @click="abrirModalPago" :disabled="enviando || !carrito.length">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                <line x1="1" y1="10" x2="23" y2="10"></line>
              </svg>
              {{ enviando ? 'Procesando...' : 'Cobrar' }}
            </button>

            <button class="btn-secondary" @click="cancelar" :disabled="!carrito.length">
              Cancelar pedido
            </button>
          </div>
        </div>
      </div>
    </div>

    <PaymentModal v-if="showPagoModal" :show="true" :total="total" :clientName="cliente" :initialComments="comentarios"
      @close="showPagoModal = false" @confirm="confirmarPago" />
  </main>
</template>

<style scoped>
* {
  box-sizing: border-box;
}

.pos-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #ffeb99 0%, #ffffff 50%, #8b5e3c 100%);
  padding: 2rem;
  position: relative;
  overflow: hidden;
}

.pos-container::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background:
    radial-gradient(circle at 20% 30%, rgba(255, 235, 153, 0.12) 0%, transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(139, 94, 60, 0.08) 0%, transparent 50%);
  animation: float 20s ease-in-out infinite;
  pointer-events: none;
}

@keyframes float {

  0%,
  100% {
    transform: translate(0, 0) rotate(0deg);
  }

  50% {
    transform: translate(30px, 30px) rotate(5deg);
  }
}

.pos-layout {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  gap: 2rem;
  max-width: 1800px;
  margin: 0 auto;
  height: calc(100vh - 4rem);
  position: relative;
  z-index: 1;
}

/* Panel de búsqueda */
.search-panel {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 24px;
  padding: 2rem;
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.15),
    0 0 0 1px rgba(255, 255, 255, 0.5) inset;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-input {
  width: 100%;
  padding: 0.9rem 1.25rem 0.9rem 3.5rem;
  border: 1px solid rgba(99, 102, 241, 0.12);
  border-radius: 14px;
  font-size: 1rem;
  background: linear-gradient(180deg, #ffffff 0%, #f6f8ff 100%);
  transition:
    box-shadow 0.25s ease,
    transform 0.15s ease,
    border-color 0.15s ease;
  outline: none;
  box-shadow: 0 6px 20px rgba(139, 94, 60, 0.08);
}

.search-input::placeholder {
  color: rgba(30, 41, 59, 0.45);
  font-weight: 600;
}

.search-input:focus {
  border-color: #ffd54f;
  box-shadow: 0 10px 30px rgba(109, 93, 246, 0.18);
  transform: translateY(-2px);
}

.search-icon {
  position: absolute;
  left: 0.9rem;
  top: 50%;
  transform: translateY(-50%);
  color: #8b5e3c;
  pointer-events: none;
  background: linear-gradient(135deg, rgba(217, 164, 65, 0.12), rgba(139, 94, 60, 0.06));
  padding: 0.5rem;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 16px rgba(139, 94, 60, 0.07);
  transition:
    transform 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

.search-input:focus+.search-icon {
  color: #fff;
  transform: translateY(-50%) scale(1.05);
  background: linear-gradient(135deg, #d9a441, #8b5e3c);
  box-shadow: 0 10px 28px rgba(139, 94, 60, 0.22);
}

.suggestions-container {
  flex: 1;
  overflow-y: auto;
  margin: 0 -2rem;
  padding: 0 2rem;
}

.suggestions-container::-webkit-scrollbar {
  width: 8px;
}

.suggestions-container::-webkit-scrollbar-track {
  background: rgba(217, 164, 65, 0.04);
  border-radius: 10px;
}

.suggestions-container::-webkit-scrollbar-thumb {
  background: linear-gradient(135deg, #d9a441 0%, #8b5e3c 100%);
  border-radius: 10px;
}

.suggestions-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.producto-card {
  padding: 1.25rem;
  background: linear-gradient(135deg, #ffffff 0%, #fffaf0 100%);
  border: 2px solid rgba(139, 94, 60, 0.08);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  position: relative;
  overflow: hidden;
}

.producto-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(217, 164, 65, 0.1), transparent);
  transition: left 0.5s;
}

.producto-card:hover::before {
  left: 100%;
}

.producto-card:hover {
  border-color: #d9a441;
  transform: translateY(-4px) scale(1.02);
  box-shadow:
    0 12px 30px rgba(139, 94, 60, 0.18),
    0 0 0 1px rgba(139, 94, 60, 0.06) inset;
}

.producto-info {
  flex: 1;
  min-width: 0;
}

.producto-nombre {
  font-size: 1rem;
  font-weight: 700;
  background: linear-gradient(135deg, #d9a441 0%, #8b5e3c 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0 0 0.375rem 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.producto-linea {
  font-size: 0.875rem;
  color: #8b5e3c;
  font-weight: 500;
  padding: 0.25rem 0.75rem;
  background: rgba(139, 94, 60, 0.06);
  border-radius: 20px;
  display: inline-block;
}

.producto-precio {
  font-size: 1.25rem;
  font-weight: 800;
  background: linear-gradient(135deg, #ffe8c2 0%, #d9a441 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  white-space: nowrap;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  text-align: center;
  color: #8b5e3c;
  gap: 1.5rem;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid rgba(139, 94, 60, 0.18);
  border-top-color: #8b5e3c;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-state svg {
  opacity: 0.4;
  filter: drop-shadow(0 4px 8px rgba(139, 94, 60, 0.18));
}

.empty-state p {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
}

/* Panel del carrito */
.cart-panel {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 24px;
  padding: 2rem;
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.15),
    0 0 0 1px rgba(255, 255, 255, 0.5) inset;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.cart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 2px solid rgba(217, 164, 65, 0.08);
}

.cart-header h2 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 800;
  background: linear-gradient(135deg, #d9a441 0%, #8b5e3c 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.item-count {
  padding: 0.5rem 1.25rem;
  background: linear-gradient(135deg, #d9a441 0%, #8b5e3c 100%);
  border-radius: 30px;
  font-size: 0.875rem;
  font-weight: 700;
  color: white;
  box-shadow: 0 4px 12px rgba(139, 94, 60, 0.24);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {

  0%,
  100% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.05);
  }
}

.cart-content {
  flex: 1;
  overflow-y: auto;
  margin: 0 -2rem;
  padding: 0 2rem;
}

.cart-content::-webkit-scrollbar {
  width: 8px;
}

.cart-content::-webkit-scrollbar-track {
  background: rgba(217, 164, 65, 0.04);
  border-radius: 10px;
}

.cart-content::-webkit-scrollbar-thumb {
  background: linear-gradient(135deg, #d9a441 0%, #8b5e3c 100%);
  border-radius: 10px;
}

.cart-items {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.cart-item {
  padding: 1.5rem;
  background: linear-gradient(135deg, #ffffff 0%, #f8f9ff 100%);
  border: 2px solid rgba(139, 94, 60, 0.08);
  border-radius: 20px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.cart-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: linear-gradient(180deg, #d9a441 0%, #8b5e3c 50%, #ffe8c2 100%);
  transform: scaleY(0);
  transition: transform 0.3s;
  transform-origin: top;
}

.cart-item:hover::before {
  transform: scaleY(1);
}

.cart-item:hover {
  border-color: #d9a441;
  box-shadow:
    0 8px 24px rgba(139, 94, 60, 0.18),
    0 0 0 1px rgba(139, 94, 60, 0.06) inset;
  transform: translateX(4px);
}

.item-details {
  margin-bottom: 1.25rem;
}

.item-nombre {
  margin: 0 0 0.5rem 0;
  font-size: 1.125rem;
  font-weight: 700;
  color: #4a3220;
}

.item-medida {
  font-size: 0.875rem;
  color: #8b5e3c;
  font-weight: 500;
  padding: 0.25rem 0.75rem;
  background: rgba(139, 94, 60, 0.06);
  border-radius: 20px;
  display: inline-block;
}

.item-controls {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.quantity-control {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: linear-gradient(135deg, #f8f9ff 0%, #f0f2ff 100%);
  border-radius: 16px;
  padding: 0.5rem;
  box-shadow: 0 4px 12px rgba(139, 94, 60, 0.08);
}

.qty-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: linear-gradient(135deg, #d9a441 0%, #8b5e3c 100%);
  border-radius: 12px;
  cursor: pointer;
  font-size: 1.25rem;
  font-weight: 700;
  color: white;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(139, 94, 60, 0.24);
}

.qty-btn:hover {
  transform: scale(1.06);
  box-shadow: 0 8px 22px rgba(139, 94, 60, 0.32);
}

.qty-btn:active {
  transform: scale(0.95);
}

.qty-input {
  width: 60px;
  text-align: center;
  border: none;
  background: transparent;
  font-size: 1.125rem;
  font-weight: 700;
  color: #8b5e3c;
  outline: none;
}

.qty-input::-webkit-inner-spin-button,
.qty-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.item-pricing {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.375rem;
}

.item-precio {
  font-size: 0.875rem;
  color: #8b5e3c;
  font-weight: 600;
}

.item-total {
  font-size: 1.375rem;
  font-weight: 800;
  background: linear-gradient(135deg, #ffe8c2 0%, #d9a441 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.delete-btn {
  width: 48px;
  height: 48px;
  border: none;
  background: linear-gradient(135deg, #ff9a8a 0%, #c6862f 100%);
  border-radius: 12px;
  cursor: pointer;
  color: white;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(255, 107, 157, 0.3);
}

.delete-btn:hover {
  transform: scale(1.1) rotate(5deg);
  box-shadow: 0 6px 20px rgba(255, 107, 157, 0.4);
}

.delete-btn:active {
  transform: scale(0.95);
}

.empty-cart {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
  color: #8b5e3c;
  gap: 1.5rem;
}

.empty-cart svg {
  opacity: 0.4;
  filter: drop-shadow(0 8px 16px rgba(139, 94, 60, 0.18));
  animation: float-icon 3s ease-in-out infinite;
}

@keyframes float-icon {

  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-10px);
  }
}

.empty-cart h3 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  background: linear-gradient(135deg, #d9a441 0%, #8b5e3c 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.empty-cart p {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
}

/* Panel de resumen */
.summary-panel {
  display: flex;
  flex-direction: column;
}

.summary-card {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 249, 255, 0.95) 100%);
  backdrop-filter: blur(20px);
  border-radius: 24px;
  padding: 2rem;
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.15),
    0 0 0 1px rgba(255, 255, 255, 0.5) inset;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  position: sticky;
  top: 0;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.summary-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 800;
  background: linear-gradient(135deg, #d9a441 0%, #8b5e3c 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.summary-divider {
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(217, 164, 65, 0.3), transparent);
}

.summary-rows {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  font-size: 1rem;
  color: #6b4b36;
  font-weight: 600;
  padding: 0.5rem;
  border-radius: 10px;
  transition: all 0.3s;
}

.summary-row:hover {
  background: rgba(217, 164, 65, 0.04);
  transform: translateX(4px);
}

.summary-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 1.125rem;
  font-weight: 700;
  color: #4a3220;
  padding: 1.5rem;
  background: linear-gradient(135deg, #f8f9ff 0%, #f0f2ff 100%);
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(139, 94, 60, 0.08);
}

.total-amount {
  font-size: 2.25rem;
  font-weight: 900;
  background: linear-gradient(135deg, #d9a441 0%, #8b5e3c 50%, #ffe8c2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: gradient-shift 3s ease infinite;
}

@keyframes gradient-shift {

  0%,
  100% {
    filter: hue-rotate(0deg);
  }

  50% {
    filter: hue-rotate(10deg);
  }
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.btn-primary,
.btn-secondary {
  padding: 1.125rem 1.75rem;
  border: none;
  border-radius: 16px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  position: relative;
  overflow: hidden;
}

.btn-primary {
  background: linear-gradient(135deg, #d9a441 0%, #8b5e3c 50%, #ffe8c2 100%);
  color: #3d2816;
  box-shadow:
    0 14px 36px rgba(139, 94, 60, 0.22),
    inset 0 -6px 18px rgba(0, 0, 0, 0.04);
  letter-spacing: 0.3px;
}

.btn-primary::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  transform: translate(-50%, -50%);
  transition:
    width 0.6s,
    height 0.6s;
}

.btn-primary:hover::before {
  width: 300px;
  height: 300px;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-6px) scale(1.01);
  box-shadow: 0 18px 44px rgba(139, 94, 60, 0.28);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(-2px) scale(0.995);
}

.btn-primary:disabled {
  background: linear-gradient(135deg, #f0e6d0 0%, #d9c4a0 100%);
  cursor: not-allowed;
  box-shadow: none;
}

.btn-secondary {
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  border: 1px solid rgba(79, 70, 229, 0.12);
  box-shadow: 0 6px 18px rgba(79, 70, 229, 0.06);
}

.btn-secondary:hover:not(:disabled) {
  background: linear-gradient(180deg, #ffffff 0%, #f0f6ff 100%);
  border-color: rgba(79, 70, 229, 0.28);
  transform: translateY(-4px);
  box-shadow: 0 12px 28px rgba(79, 70, 229, 0.12);
}

.btn-secondary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}


/* Responsive */
@media (max-width: 1400px) {
  .pos-layout {
    grid-template-columns: 1fr 1.5fr 1fr;
  }
}

@media (max-width: 1024px) {
  .pos-layout {
    grid-template-columns: 1fr;
    height: auto;
  }

  .search-panel,
  .cart-panel,
  .summary-panel {
    height: auto;
    min-height: 400px;
  }
}

/*.option-btn{
  height: 48px;
  max-width: 100%;
}

.payment-options{
  padding: 0 2rem 2rem 2rem;
  display: flex;
  flex-direction: column;
}*/
</style>

<!-- Receipt Printer Component (hidden, only for printing) -->
<ReceiptPrinter ref="receiptPrinter" :data="currentReceipt" />
