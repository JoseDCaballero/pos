<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import api from 'src/api/axios'
import { usePedidosStore, type ProductoPedido } from 'src/stores/pedidos-store'
import { useQuasar } from 'quasar'
import { socket } from 'src/boot/socket'
import { useAuthStore } from 'src/stores/auth';

interface Producto {
  id: number
  producto_id?: number
  bodega_id: number
  producto?: {
    id?: number
    nombre: string
    categoria_id: number
  }
  categoria_id?: number
  categoriaId?: number
  rollos: number
  cantidad: number
  medida_gru: string
  medida_ind: string
}

interface Categoria {
  id: number
  nombre: string
}

interface ProductoConCantidad extends Producto {
  cantidadPedido: number
}

const props = defineProps({
  categoryId: {
    type: [String, Number],
    default: ''
  },
  descripcion: {
    type: String,
    default: ''
  }
})

const $q = useQuasar()
const pedidosStore = usePedidosStore()

const productos = ref<ProductoConCantidad[]>([])
const categoria = ref<Categoria | null>(null)
const categoriaSeleccionada = ref<string | number>('')
const loading = ref(false)
const enviandoPedido = ref(false)
const datos = ref<{ email?: string } | null>(null);
const nombreCliente = ref<string>('')
const authStore = useAuthStore();

const cargarProductos = async () => {
  loading.value = true
  try {
    const res = await api.get('inventarios')
    const items = Array.isArray(res.data) ? res.data : (res.data.items ?? [])
    productos.value = items.map((p: Producto) => ({ ...p, cantidadPedido: 0 }))
    // Después de cargar productos intentamos restaurar cantidades desde sessionStorage
    restaurarTemporal()
  } catch (err) {
    console.error('Error cargando productos', err)
    productos.value = []
  } finally {
    loading.value = false
  }
}

const cargarCategoria = async () => {
  if (!props.categoryId) return
  try {
    const res = await api.get(`categorias/${props.categoryId}`)
    categoria.value = res.data
  } catch (err) {
    console.error('Error cargando categoría', err)
  }
}

const productosFiltrados = () => {
  if (!categoriaSeleccionada.value) return productos.value.filter(p => p.bodega_id === 1)
  const id = Number(categoriaSeleccionada.value)
  return productos.value.filter(p => {
    const catId = p.producto?.categoria_id ?? p.categoria_id ?? p.categoriaId
    return catId === id && p.bodega_id === 1
  })
}

const productosSeleccionados = computed(() => {
  return productos.value.filter(p => p.cantidadPedido > 0)
})

const hayProductosSeleccionados = computed(() => {
  return productosSeleccionados.value.length > 0
})

const incrementarCantidad = (prod: ProductoConCantidad) => {
  const max = prod.cantidad
  if (prod.cantidadPedido < max) {
    prod.cantidadPedido = prod.cantidadPedido + 0.5
  }
}

const decrementarCantidad = (prod: ProductoConCantidad) => {
  if (prod.cantidadPedido > 0) {
    prod.cantidadPedido = prod.cantidadPedido - 0.5
  }
}

const enviarPedido = async () => {
  if (!hayProductosSeleccionados.value) {
    $q.notify({
      message: 'Debes seleccionar al menos un producto',
      color: 'warning',
      icon: 'warning',
      position: 'top'
    })
    return
  }

  if (!nombreCliente.value.trim()) {
    $q.notify({
      message: 'Ingresa el nombre del cliente',
      color: 'warning',
      icon: 'warning',
      position: 'top'
    })
    return
  }

  enviandoPedido.value = true

  try {
    const comprador = nombreCliente.value.trim()

    const productosParaPedido: ProductoPedido[] = productosSeleccionados.value.map(p => ({
      productoId: Number(p.producto_id ?? p.producto?.id ?? p.id),
      nombre: p.producto?.nombre || 'Producto',
      cantidad: p.cantidadPedido,
      medida: p.medida_ind
    }))

    const pedido = {
      comprador,
      productos: productosParaPedido,
      estado: 'pendiente' as const
    }

    // Guardar en la base de datos mediante el store
    const creado = await pedidosStore.agregarPedido(pedido)

    // Emitir evento por socket con el pedido creado (incluye id/fecha)
    socket.emit('nuevo-pedido', creado)

    // Limpiar cantidades seleccionadas
    productos.value.forEach(p => {
      p.cantidadPedido = 0
    })

    // Limpiar nombre del cliente después de enviar
    nombreCliente.value = ''
    // Limpiar almacenamiento temporal
    sessionStorage.removeItem('pedido_temp')

    $q.notify({
      message: '¡Pedido enviado exitosamente!',
      color: 'positive',
      icon: 'check_circle',
      position: 'top'
    })
  } catch (err) {
    console.error('Error enviando pedido:', err)
    $q.notify({
      message: 'Error al enviar el pedido',
      color: 'negative',
      icon: 'error',
      position: 'top'
    })
  } finally {
    enviandoPedido.value = false
  }
}

const cancelarPedido = () => {
  productos.value.forEach(p => {
    p.cantidadPedido = 0
  })
  // Limpiar almacenamiento temporal cuando se cancela
  sessionStorage.removeItem('pedido_temp')
  $q.notify({
    message: 'Pedido cancelado',
    color: 'info',
    icon: 'info',
    position: 'top'
  })
}

// Persistencia temporal del pedido (nombre y cantidades) en sessionStorage
const STORAGE_KEY = 'pedido_temp'

const guardarTemporal = () => {
  try {
    const seleccion = productos.value
      .filter(p => p.cantidadPedido > 0)
      .map(p => ({ id: p.id, cantidadPedido: p.cantidadPedido }))

    const payload = {
      nombreCliente: nombreCliente.value,
      seleccion
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch (err) {
    console.error('Error guardando temporal:', err)
  }
}

const restaurarTemporal = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    if (data?.nombreCliente) {
      nombreCliente.value = data.nombreCliente
    }
    if (Array.isArray(data?.seleccion)) {
      data.seleccion.forEach((s: { id: number; cantidadPedido: number }) => {
        const prod = productos.value.find(p => p.id === s.id)
        if (prod) prod.cantidadPedido = s.cantidadPedido
      })
    }
  } catch (err) {
    console.error('Error restaurando temporal:', err)
  }
}

// Vigilar cambios para guardar temporalmente
watch(productos, () => guardarTemporal(), { deep: true })
watch(nombreCliente, () => guardarTemporal())

// Inicialización
onMounted(async () => {
  const datosString = sessionStorage.getItem('user_data');
  if (datosString) {
    datos.value = JSON.parse(datosString);
  }

  if (props.categoryId) {
    categoriaSeleccionada.value = props.categoryId
  }
  void cargarCategoria()
  await cargarProductos()
  // asegurar que si el store de auth ya tiene user lo asignamos
  datos.value = authStore.user;
})

watch(() => props.categoryId, (newVal) => {
  if (newVal) {
    categoriaSeleccionada.value = newVal
  }
})
</script>

<template>
  <main class="home-page">
    <nav class="breadcrumb">
      <router-link to="/tienda" class="breadcrumb-item">Categorías Tienda</router-link>
      <span class="breadcrumb-separator">/</span>
      <span class="breadcrumb-current">{{ categoria?.nombre || 'Cargando...' }}</span>
    </nav>
    <div v-if="props.descripcion" class="descripcion-container">
      <p class="descripcion">{{ props.descripcion }}</p>
    </div>
    <section>
      <h1 class="main-title">Productos</h1>

      <!-- Botón flotante de resumen -->
      <div v-if="hayProductosSeleccionados" class="floating-summary">
        <div class="summary-content">
          <span class="summary-count">{{ productosSeleccionados.length }} producto(s) seleccionado(s)</span>
          <div class="summary-actions">
            <button @click="cancelarPedido" class="btn-cancel">Cancelar</button>
            <button @click="enviarPedido" :disabled="enviandoPedido" class="btn-send">
              {{ enviandoPedido ? 'Enviando...' : 'Enviar Pedido' }}
            </button>
          </div>
          <input v-if="datos?.email === 'vendedor'" type="text" id="client-name" v-model="nombreCliente"
            placeholder="Nombre cliente" class="qt-input" required />
        </div>
      </div>

      <div v-if="loading">Cargando productos...</div>
      <div v-else>
        <section v-if="productosFiltrados().length" class="actions">
          <div v-for="prod in productosFiltrados()" :key="prod.id" class="card"
            :class="{ 'card-selected': prod.cantidadPedido > 0 }">
            <h3>{{ prod.producto?.nombre }}</h3>
            <p class="stock-info">Stock: {{ prod.cantidad }} {{ prod.medida_ind }}</p>

            <div class="quantity-control" v-if="datos?.email === 'vendedor'">
              <button @click="decrementarCantidad(prod)" class="btn-qty"
                :disabled="prod.cantidadPedido === 0">-</button>
              <input type="number" v-model.number="prod.cantidadPedido" inputmode="decimal" min="0" step="any"
                :max="prod.cantidad" class="qty-input" />
              <button @click="incrementarCantidad(prod)" class="btn-qty"
                :disabled="prod.cantidadPedido >= prod.cantidad">+</button>
            </div>
            <div v-if="prod.cantidadPedido > 0" class="selected-badge">
              ✓ Seleccionado
            </div>
          </div>
        </section>
        <div v-else>No hay productos para la categoría seleccionada.</div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.qt-input {
  width: 100%;
  box-sizing: border-box;
  margin-top: 0.5rem;
  padding: 0.5rem;
  font-size: 1rem;
  border: 2px solid #ddd;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.2s;
}

.qt-input:focus {
  border-color: #ffd54f;
}

h3 {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.descripcion-container {
  text-align: center;
  padding: 1.5rem 2rem;
  background: rgba(255, 255, 255, 0.8);
  margin: 0 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.descripcion {
  font-size: 1.1rem;
  color: #555;
  margin: 0;
  line-height: 1.6;
}

.main-title {
  text-align: center;
  margin-top: 0.5rem;
  margin-bottom: 1.5rem;
  font-size: 2.5rem;
  color: #333;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 32px;
  margin: 1rem auto;
  max-width: 1400px;
  flex-wrap: wrap;
  padding: 0 2rem 120px 2rem;
}

.card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.07);
  padding: 32px 24px;
  width: 260px;
  text-align: center;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  border: 2px solid transparent;
}

.card:hover {
  transform: translateY(-6px) scale(1.03);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.card-selected {
  border-color: #4CAF50;
  background: #f0f9f0;
}

.stock-info {
  font-size: 1.2rem;
  color: #666;
  margin: 0.5rem 0;
  font-weight: 600;
}

.stock-detail {
  font-size: 0.9rem;
  color: #999;
  margin: 0.25rem 0 1rem 0;
}

.quantity-control {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 1rem;
  width: 100%;
  justify-content: center;
}

.btn-qty {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #ffd54f 0%, #8B5E3C 100%);
  color: white;
  font-size: 1.5rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-qty:hover:not(:disabled) {
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(255, 213, 79);
}

.btn-qty:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.qty-input {
  width: 70px;
  height: 40px;
  text-align: center;
  font-size: 1.2rem;
  font-weight: 600;
  border: 2px solid #ddd;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.2s;
}

.qty-input:focus {
  border-color: #dfbc4a;
}

.selected-badge {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
  color: white;
  border-radius: 20px;
  font-size: 0.9rem;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
}

.floating-summary {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  background: white;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  padding: 1.5rem 2rem;
  z-index: 1000;
  min-width: 400px;
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    transform: translateX(-50%) translateY(100px);
    opacity: 0;
  }

  to {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
  }
}

.summary-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: center;
}

.summary-count {
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
}

.summary-actions {
  display: flex;
  gap: 1rem;
}

.btn-cancel,
.btn-send {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: #f44336;
  color: white;
}

.btn-cancel:hover {
  background: #d32f2f;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(244, 67, 54, 0.4);
}

.btn-send {
  background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
  color: white;
}

.btn-send:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
}

.btn-send:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.home-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  font-family: 'Segoe UI', Arial, sans-serif;
  padding-bottom: 2rem;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 2rem;
  font-size: 0.95rem;
}

.breadcrumb-item {
  color: #007bff;
  text-decoration: none;
  transition: color 0.2s;
}

.breadcrumb-item:hover {
  color: #0056b3;
  text-decoration: underline;
}

.breadcrumb-separator {
  color: #6c757d;
}

.breadcrumb-current {
  color: #495057;
  font-weight: 500;
}

@media (max-width: 768px) {
  .floating-summary {
    min-width: 90%;
    left: 5%;
    transform: none;
    bottom: 1rem;
  }

  @keyframes slideUp {
    from {
      transform: translateY(100px);
      opacity: 0;
    }

    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .summary-actions {
    flex-direction: column;
    width: 100%;
  }

  .btn-cancel,
  .btn-send {
    width: 100%;
  }
}
</style>
