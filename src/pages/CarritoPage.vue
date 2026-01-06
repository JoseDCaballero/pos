<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import api from 'src/api/axios'
import { usePedidosStore } from 'src/stores/pedidos-store'
import { useQuasar } from 'quasar'

interface Producto {
  id: number
  producto_id?: number
  nombre?: string
  precio?: number
  linea?: string
}

interface ItemCarrito {
  productoId: number
  nombre: string
  cantidad: number
  medida: string
  precio?: number
}

const $q = useQuasar()
const pedidosStore = usePedidosStore()

const term = ref('')
const sugerencias = ref<Producto[]>([])
const buscando = ref(false)

const carrito = ref<ItemCarrito[]>([])
const cliente = ref('')
const enviando = ref(false)
const showPagoModal = ref(false)
const montoPagado = ref<number | null>(null)

const buscar = async (valor: string) => {
  if (!valor) {
    sugerencias.value = []
    return
  }
  buscando.value = true
  try {
    const res = await api.get('productos/all')
    const items: Producto[] = Array.isArray(res.data) ? res.data : (res.data.items ?? [])
    const q = valor.toLowerCase()
    sugerencias.value = items.filter(i => (i.nombre ?? '').toLowerCase().includes(q)).slice(0, 12)
  } catch (err) {
    console.error('Error buscando productos', err)
    sugerencias.value = []
  } finally {
    buscando.value = false
  }
}

const onTermInput = (e: Event) => {
  const el = e.target as HTMLInputElement | null
  const v = el ? el.value : ''
  term.value = v
  void buscar(v)
}

const agregarAlCarrito = (p: Producto) => {
  const pid = Number(p.producto_id ?? p.id)
  const existente = carrito.value.find(i => i.productoId === pid)
  if (existente) {
    existente.cantidad = existente.cantidad + 1
  } else {
    const base = { productoId: pid, nombre: p.nombre || 'Producto', cantidad: 1, medida: p.linea }
    const item = (p.precio !== undefined) ? Object.assign({}, base, { precio: Number(p.precio) }) : base
    carrito.value.push(item as ItemCarrito)
  }
  term.value = ''
  sugerencias.value = []
}

const fmt = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2) : '--'
}

const quitar = (id: number) => {
  carrito.value = carrito.value.filter(i => i.productoId !== id)
}

const actualizarCantidad = (id: number, cantidad: number) => {
  const it = carrito.value.find(i => i.productoId === id)
  if (!it) return
  it.cantidad = cantidad <= 0 ? 0 : cantidad
}

const subtotal = computed(() => carrito.value.reduce((s, i) => s + (Number(i.precio ?? 0) * i.cantidad), 0))
const impuestos = computed(() => +(subtotal.value * 0.16).toFixed(2))
const total = computed(() => +(subtotal.value + impuestos.value).toFixed(2))

const enviar = async (extra: { comprador?: string } = {}) => {
  if (!carrito.value.length) {
    $q.notify({ message: 'El carrito está vacío', color: 'warning' })
    return
  }
  enviando.value = true
  try {
    const pedido = {
      comprador: (extra.comprador ?? cliente.value ?? '').trim() || 'Cliente',
      productos: carrito.value.map(i => ({ productoId: i.productoId, nombre: i.nombre, cantidad: i.cantidad, medida: i.medida })),
      estado: 'pendiente' as const
    }
    // Log payload for debugging server errors
    console.log('Enviando pedido payload:', pedido)
    const creado = await pedidosStore.agregarPedido(pedido)
    $q.notify({ message: 'Pedido creado', color: 'positive' })
    carrito.value = []
    cliente.value = ''
    sessionStorage.removeItem(import.meta.env.VITE_STORAGE_KEY)
    return creado
  } catch (err: unknown) {
    const maybe = err as { response?: { data?: unknown }; message?: string }
    console.error('Error creando pedido', err, maybe.response?.data ?? null)
    const data = maybe.response?.data
    let serverError: string | undefined
    if (typeof data === 'object' && data !== null && 'error' in data && typeof (data as Record<string, unknown>).error === 'string') {
      serverError = (data as Record<string, unknown>).error as string
    }
    const msg = serverError ?? maybe.message ?? 'Error al crear pedido'
    $q.notify({ message: String(msg), color: 'negative' })
  } finally {
    enviando.value = false
  }
}

const abrirModalPago = () => {
  montoPagado.value = Number(total.value) || 0
  showPagoModal.value = true
}

const cambio = computed(() => {
  const mp = Number(montoPagado.value ?? 0)
  return +(mp - Number(total.value) || 0).toFixed(2)
})

const confirmarPago = async () => {
  if ((montoPagado.value ?? 0) < Number(total.value)) {
    $q.notify({ message: 'Monto insuficiente', color: 'negative' })
    return
  }
  showPagoModal.value = false
  // Construir detallesVenta a partir del carrito antes de enviarlo
  const detallesVenta = carrito.value.map(i => ({
    producto_id: Number(i.productoId),
    cantidad: Number(i.cantidad),
    precio_unitario: Number(i.precio ?? 0)
  }))

  try {
    // Crear pedido en la base de datos
    const creado = await enviar({ comprador: cliente.value })

    if (!creado || !creado.id) {
      throw new Error('No se pudo crear el pedido antes de procesar la venta')
    }

    const payload = {
      cliente: cliente.value || 'Cliente',
      total: Number(total.value),
      detallesVenta,
      bodega_id: 1
    }

    const resp = await api.post('ventas', payload)

    if (resp && (resp.status === 200 || resp.status === 201)) {
      // Marcar pedido como pagado
      await pedidosStore.actualizarEstadoPedido(creado.id, 'pagado')
      $q.notify({ message: `Cambio: ${cambio.value.toFixed(2)}`, color: 'info' })
    } else {
      throw new Error('Respuesta inesperada del servidor al procesar la venta')
    }
  } catch (err) {
    console.error('Error procesando pago:', err)
    const msg = (err instanceof Error) ? err.message : 'Error procesando el pago'
    $q.notify({ message: msg, color: 'negative' })
  }
}

const cancelar = () => {
  carrito.value = []
  cliente.value = ''
  sessionStorage.removeItem(import.meta.env.VITE_STORAGE_KEY)
  $q.notify({ message: 'Pedido cancelado', color: 'info' })
}

const guardar = () => {
  try {
    sessionStorage.setItem(import.meta.env.VITE_STORAGE_KEY, JSON.stringify({ carrito: carrito.value }))
  } catch (err) {
    console.error('Error guardando carrito', err)
  }
}

const restaurar = () => {
  try {
    const raw = sessionStorage.getItem(import.meta.env.VITE_STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    carrito.value = data?.carrito || []
  } catch (err) {
    console.error('Error restaurando carrito', err)
  }
}

watch(carrito, () => guardar(), { deep: true })

onMounted(() => {
  restaurar()
})
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
                <span class="producto-linea">{{ producto.linea }}</span>
              </div>
              <div class="producto-precio">${{ fmt(producto.precio) }}</div>
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
          <h2>Carrito de compra</h2>
          <span class="item-count">{{ carrito.length }} productos</span>
        </div>

        <div class="cart-content">
          <div v-if="carrito.length" class="cart-items">
            <div v-for="item in carrito" :key="item.productoId" class="cart-item">
              <div class="item-details">
                <h4 class="item-nombre">{{ item.nombre }}</h4>
                <span class="item-medida">{{ item.medida }}</span>
              </div>

              <div class="item-controls">
                <div class="quantity-control">
                  <button class="qty-btn" @click="actualizarCantidad(item.productoId, item.cantidad - 1)">−</button>
                  <input type="number" class="qty-input" v-model.number="item.cantidad"
                    @change="actualizarCantidad(item.productoId, item.cantidad)" min="0" />
                  <button class="qty-btn" @click="actualizarCantidad(item.productoId, item.cantidad + 1)">+</button>
                </div>

                <div class="item-pricing">
                  <span class="item-precio">${{ fmt(item.precio) }}</span>
                  <span class="item-total">${{ fmt(Number(item.precio) * item.cantidad) }}</span>
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
            <div class="summary-row">
              <span>IVA (16%)</span>
              <span>${{ impuestos.toFixed(2) }}</span>
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

    <!-- Modal de Pago -->
    <Transition name="modal">
      <div v-if="showPagoModal" class="modal-overlay" @click.self="showPagoModal = false">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Procesar pago</h3>
            <button class="modal-close" @click="showPagoModal = false">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div class="modal-body">
            <div class="payment-info">
              <div class="info-row">
                <span class="info-label">Total a pagar</span>
                <span class="info-value total-highlight">${{ total.toFixed(2) }}</span>
              </div>

              <div class="input-group">
                <label for="monto-pagado">Monto recibido</label>
                <div class="input-wrapper">
                  <span class="input-prefix">$</span>
                  <input id="monto-pagado" type="number" v-model.number="montoPagado" min="0" step="0.01"
                    class="payment-input" />
                </div>
              </div>

              <div class="info-row cambio-row">
                <span class="info-label">Cambio</span>
                <span class="info-value" :class="{ 'negative': cambio < 0 }">
                  ${{ cambio.toFixed(2) }}
                </span>
              </div>
            </div>
          </div>

          <!--DESDE AQUI COMENZAR A CONSTRUIR LAS OPCIONES DE PAGO-->

          <!--<div class="payment-options">
            <h4>Opciones de pago</h4>
            <div class="options-list">
              <button class="option-btn" @click="montoPagado = total">
                Efectivo
              </button>
              <button class="option-btn" @click="montoPagado = total">
                Tarjeta
              </button>
              <button class="option-btn" @click="montoPagado = total">
                Transferencia
              </button>
            </div>
          </div>-->

          <div class="modal-footer">
            <button class="btn-secondary" @click="showPagoModal = false">
              Cancelar
            </button>
            <button class="btn-primary" @click="confirmarPago" :disabled="(montoPagado ?? 0) < total">
              Confirmar pago
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </main>
</template>

<style scoped>
* {
  box-sizing: border-box;
}

.pos-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #FFEB99 0%, #FFFFFF 50%, #8B5E3C 100%);
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
  background: radial-gradient(circle at 20% 30%, rgba(255, 235, 153, 0.12) 0%, transparent 50%),
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
  transition: box-shadow 0.25s ease, transform 0.15s ease, border-color 0.15s ease;
  outline: none;
  box-shadow: 0 6px 20px rgba(139, 94, 60, 0.08);
}

.search-input::placeholder {
  color: rgba(30, 41, 59, 0.45);
  font-weight: 600;
}

.search-input:focus {
  border-color: #FFD54F;
  box-shadow: 0 10px 30px rgba(109, 93, 246, 0.18);
  transform: translateY(-2px);
}

.search-icon {
  position: absolute;
  left: 0.9rem;
  top: 50%;
  transform: translateY(-50%);
  color: #8B5E3C;
  pointer-events: none;
  background: linear-gradient(135deg, rgba(217, 164, 65, 0.12), rgba(139, 94, 60, 0.06));
  padding: 0.5rem;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 16px rgba(139, 94, 60, 0.07);
  transition: transform 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
}

.search-input:focus+.search-icon {
  color: #fff;
  transform: translateY(-50%) scale(1.05);
  background: linear-gradient(135deg, #D9A441, #8B5E3C);
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
  background: linear-gradient(135deg, #D9A441 0%, #8B5E3C 100%);
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
  background: linear-gradient(90deg, transparent, rgba(217, 164, 65, 0.10), transparent);
  transition: left 0.5s;
}

.producto-card:hover::before {
  left: 100%;
}

.producto-card:hover {
  border-color: #D9A441;
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
  background: linear-gradient(135deg, #D9A441 0%, #8B5E3C 100%);
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
  color: #8B5E3C;
  font-weight: 500;
  padding: 0.25rem 0.75rem;
  background: rgba(139, 94, 60, 0.06);
  border-radius: 20px;
  display: inline-block;
}

.producto-precio {
  font-size: 1.25rem;
  font-weight: 800;
  background: linear-gradient(135deg, #FFE8C2 0%, #D9A441 100%);
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
  color: #8B5E3C;
  gap: 1.5rem;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid rgba(139, 94, 60, 0.18);
  border-top-color: #8B5E3C;
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
  background: linear-gradient(135deg, #D9A441 0%, #8B5E3C 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.item-count {
  padding: 0.5rem 1.25rem;
  background: linear-gradient(135deg, #D9A441 0%, #8B5E3C 100%);
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
  background: linear-gradient(135deg, #D9A441 0%, #8B5E3C 100%);
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
  background: linear-gradient(180deg, #D9A441 0%, #8B5E3C 50%, #FFE8C2 100%);
  transform: scaleY(0);
  transition: transform 0.3s;
  transform-origin: top;
}

.cart-item:hover::before {
  transform: scaleY(1);
}

.cart-item:hover {
  border-color: #D9A441;
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
  color: #8B5E3C;
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
  background: linear-gradient(135deg, #D9A441 0%, #8B5E3C 100%);
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
  color: #8B5E3C;
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
  color: #8B5E3C;
  font-weight: 600;
}

.item-total {
  font-size: 1.375rem;
  font-weight: 800;
  background: linear-gradient(135deg, #FFE8C2 0%, #D9A441 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.delete-btn {
  width: 48px;
  height: 48px;
  border: none;
  background: linear-gradient(135deg, #FF9A8A 0%, #C6862F 100%);
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
  color: #8B5E3C;
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
  background: linear-gradient(135deg, #D9A441 0%, #8B5E3C 100%);
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
  background: linear-gradient(135deg, #D9A441 0%, #8B5E3C 100%);
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
  background: linear-gradient(135deg, #D9A441 0%, #8B5E3C 50%, #FFE8C2 100%);
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
  background: linear-gradient(135deg, #D9A441 0%, #8B5E3C 50%, #FFE8C2 100%);
  color: #3d2816;
  box-shadow: 0 14px 36px rgba(139, 94, 60, 0.22), inset 0 -6px 18px rgba(0, 0, 0, 0.04);
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
  transition: width 0.6s, height 0.6s;
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

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(217, 164, 65, 0.36);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 2rem;
  animation: fade-in 0.3s ease-out;
}

@keyframes fade-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.modal-content {
  background: linear-gradient(135deg, #ffffff 0%, #f8f9ff 100%);
  border-radius: 28px;
  width: 100%;
  max-width: 520px;
  box-shadow:
    0 30px 60px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.5) inset;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.5);
  animation: modal-enter 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes modal-enter {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(20px);
  }

  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-header {
  padding: 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #D9A441 0%, #8B5E3C 100%);
  color: white;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 800;
}

.modal-close {
  width: 44px;
  height: 44px;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  cursor: pointer;
  color: white;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-close:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: rotate(90deg) scale(1.1);
}

.modal-body {
  padding: 2rem;
}

.payment-info {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: linear-gradient(135deg, #f8f9ff 0%, #f0f2ff 100%);
  border-radius: 14px;
  font-size: 1rem;
  font-weight: 600;
}

.info-label {
  color: #6b4b36;
}

.info-value {
  font-size: 1.25rem;
  font-weight: 800;
  color: #4a3220;
}

.total-highlight {
  font-size: 1.75rem;
  background: linear-gradient(135deg, #D9A441 0%, #8B5E3C 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.input-group label {
  font-size: 0.875rem;
  font-weight: 700;
  color: #8B5E3C;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-prefix {
  position: absolute;
  left: 1.5rem;
  font-size: 1.5rem;
  font-weight: 800;
  background: linear-gradient(135deg, #D9A441 0%, #8B5E3C 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.payment-input {
  width: 100%;
  padding: 1.25rem 1.5rem 1.25rem 3.5rem;
  border: 3px solid rgba(217, 164, 65, 0.18);
  border-radius: 16px;
  font-size: 1.5rem;
  font-weight: 800;
  background: white;
  color: #4a3220;
  transition: all 0.3s;
  outline: none;
}

.payment-input:focus {
  border-color: #D9A441;
  box-shadow:
    0 4px 20px rgba(139, 94, 60, 0.25),
    0 0 0 4px rgba(139, 94, 60, 0.1);
  transform: translateY(-2px);
}

.cambio-row {
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
  border: 2px solid rgba(34, 197, 94, 0.3);
}

.cambio-row .info-value {
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.cambio-row .info-value.negative {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.modal-footer {
  padding: 2rem;
  display: flex;
  gap: 1rem;
  background: rgba(248, 249, 255, 0.5);
  border-top: 2px solid rgba(217, 164, 65, 0.08);
}

.modal-footer .btn-primary,
.modal-footer .btn-secondary {
  flex: 1;
}

/* Transiciones del modal */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.9) translateY(20px);
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
