<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import api from 'src/api/axios'

interface Producto {
  id: number
  bodega_id: number
  producto?: {
    nombre: string
    categoria_id: number
  }
  categoria_id?: number
  categoriaId?: number
  rollos: number
  cantidad: number
  medida_gru: string
  medida_ind: string
  // New fields
  detalles?: Array<{
    cantidad: number
    estado: string
    [key: string]: unknown
  }>
  showDetails?: boolean
}

interface Categoria {
  id: number
  nombre: string
}

const props = defineProps({
  categoryId: {
    type: [String, Number],
    default: ''
  },
  technicalCard: {
    type: String,
    default: ''
  }
})

const productos = ref<Producto[]>([])
const categoria = ref<Categoria | null>(null)
const categoriaSeleccionada = ref<string | number>('')
const loading = ref(false)

const formatNumber = (val: number | string | undefined | null) => {
  if (val === null || val === undefined) return '0'
  return Number(val).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })
}

const cargarProductos = async () => {
  loading.value = true
  try {
    const res = await api.get('inventarios')
    const items = (Array.isArray(res.data) ? res.data : (res.data.items ?? [])) as Producto[]
    productos.value = items.map((p) => ({ ...p, showDetails: false }))
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
  if (!categoriaSeleccionada.value) return productos.value.filter(p => p.bodega_id === 2)
  const id = Number(categoriaSeleccionada.value)
  return productos.value.filter(p => {
    const catId = p.producto?.categoria_id ?? p.categoria_id ?? p.categoriaId
    return catId === id && p.bodega_id === 2
  })
}

onMounted(() => {
  if (props.categoryId) {
    categoriaSeleccionada.value = props.categoryId
  }
  void cargarCategoria()
  void cargarProductos()
})

watch(() => props.categoryId, (newVal) => {
  if (newVal) {
    categoriaSeleccionada.value = newVal
  }
})
</script>

<template>
  <!--<div v-if="loading" class="loading">
    <div class="spinner"></div>
    <p>Cargando pedidos...</p>
  </div>-->

  <main class="home-page">
    <nav class="breadcrumb">
      <!--<router-link to="/select" class="breadcrumb-item">Inicio</router-link>
      <span class="breadcrumb-separator">/</span>-->
      <router-link to="/bodega" class="breadcrumb-item">Categorías Bodega</router-link>
      <span class="breadcrumb-separator">/</span>
      <span class="breadcrumb-current">{{ categoria?.nombre || 'Cargando...' }}</span>
    </nav>
    <div v-if="props.technicalCard" class="descripcion-container">
      <p class="descripcion">{{ props.technicalCard }}</p>
    </div>
    <section>
      <h1 class="main-title">Productos</h1>
      <div v-if="loading">Cargando productos...</div>
      <div v-else>
        <section v-if="productosFiltrados().length" class="actions">
          <div v-for="prod in productosFiltrados()" :key="prod.id" class="card">
            <div class="card-header">
              <h3>{{ prod.producto?.nombre }}</h3>
            </div>

            <div class="card-body">
              <!-- Badge for Rolls/Group Measure -->
              <!-- <div v-if="prod.rollos > 0 || prod.medida_gru" class="badge-group"> -->
              <div v-if="prod.rollos !== prod.cantidad" class="badge-group">
                <span class="badge-icon">📦</span>
                <span class="badge-text">{{ formatNumber(prod.rollos) }} {{ prod.medida_gru }}</span>
              </div>

              <!-- Main Quantity Display -->
              <div class="stat-main">
                <span class="stat-value">{{ formatNumber(prod.cantidad) }}</span>
                <span class="stat-unit">{{ prod.medida_ind }}</span>
              </div>

              <!-- Toggle Details -->
              <div class="card-footer" v-if="prod.detalles && prod.detalles.length">
                <button class="btn-details" @click="prod.showDetails = !prod.showDetails">
                  {{ prod.showDetails ? 'Ocultar' : 'Ver' }} Detalles
                </button>
              </div>

              <!-- Details List -->
              <div v-if="prod.showDetails && prod.detalles" class="details-list">
                <div v-for="(detalle, idx) in prod.detalles" :key="idx" class="detail-item">
                  <span class="detail-idx">#{{ idx + 1 }}</span>
                  <span class="detail-val">{{ formatNumber(detalle.cantidad) }} {{ prod.medida_ind }}</span>
                  <span class="detail-status" :class="detalle.estado.toLowerCase()">{{
                    detalle.estado
                  }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
        <div v-else>No hay productos para la categoría seleccionada.</div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.main-title {
  text-align: center;
  margin-top: 2rem;
  margin-bottom: 3rem;
  font-size: 2.5rem;
  color: #1a202c;
  font-weight: 800;
  letter-spacing: -0.025em;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.actions {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 2rem;
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 2rem;
}

.card {
  background: #ffffff;
  border-radius: 20px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01);
  padding: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, 0.8);
  position: relative;
}

.card:hover {
  transform: translateY(-8px);
  box-shadow: 0 20px 35px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  border-color: #bfdbfe;
}

/* Decorative top bar */
.card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 6px;
  background: linear-gradient(135deg, #ffd54f 0%, #8b5e3c 100%);
}

.card-header {
  padding: 1.5rem 1.5rem 1rem;
  text-align: center;
  border-bottom: 1px solid #f1f5f9;
}

.card-header h3 {
  margin: 0;
  color: #1e293b;
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.4;
}

.card-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  flex: 1;
  justify-content: center;
}

.badge-group {
  background-color: #fff;
  color: #64748b;
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  font-size: 0.9rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid #dbeafe;
}

.badge-icon {
  font-size: 1.1rem;
}

.stat-main {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.stat-value {
  font-size: 3rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1;
  letter-spacing: -2px;
}

.stat-unit {
  font-size: 1rem;
  color: #64748b;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-top: 0.25rem;
}

.home-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  padding-bottom: 4rem;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem 2rem;
  font-size: 0.95rem;
  color: #64748b;
}

.breadcrumb-item {
  color: #64748b;
  text-decoration: none;
  transition: color 0.2s;
  font-weight: 500;
}

.breadcrumb-item:hover {
  color: #3b82f6;
}

.breadcrumb-separator {
  color: #cbd5e1;
}

.breadcrumb-current {
  color: #0f172a;
  font-weight: 600;
}

@media (max-width: 640px) {
  .actions {
    grid-template-columns: 1fr;
  }

  .main-title {
    font-size: 2rem;
  }
}

.card-footer {
  margin-top: 1rem;
  width: 100%;
}

.btn-details {
  background: #fff;
  border: 1px solid #cce2ff;
  color: #64748b;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
  transition: all 0.2s;
}

.btn-details:hover {
  background: #f8fafc;
  color: #64748baf;
  border-color: #bfdbfe;
}

.details-list {
  margin-top: 1rem;
  width: 100%;
  background: #f8fafc;
  border-radius: 8px;
  padding: 0.5rem;
  text-align: left;
  max-height: 150px;
  overflow-y: auto;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid #e2e8f0;
  font-size: 0.85rem;
  color: #475569;
}

.detail-item:last-child {
  border-bottom: none;
}

.detail-idx {
  color: #94a3b8;
  font-size: 0.75rem;
  width: 25px;
}

.detail-val {
  font-weight: 600;
  flex: 1;
}

.detail-status {
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  text-transform: uppercase;
}

.detail-status.disponible {
  background: #dcfce7;
  color: #166534;
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
</style>
