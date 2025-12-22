<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import axios from 'axios'

interface Producto {
  id: number
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
}

interface Categoria {
  id: number
  nombre: string
}

const props = defineProps({
  categoryId: {
    type: [String, Number],
    default: ''
  }
})

const productos = ref<Producto[]>([])
const categoria = ref<Categoria | null>(null)
const categoriaSeleccionada = ref<string | number>('')
const loading = ref(false)

const cargarProductos = async () => {
  loading.value = true
  try {
    const res = await axios.get(import.meta.env.VITE_API + 'inventarios')
    const items = Array.isArray(res.data) ? res.data : (res.data.items ?? [])
    productos.value = items
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
    const res = await axios.get(`${import.meta.env.VITE_API}categorias/${props.categoryId}`)
    categoria.value = res.data
  } catch (err) {
    console.error('Error cargando categoría', err)
  }
}

const productosFiltrados = () => {
  if (!categoriaSeleccionada.value) return productos.value
  const id = Number(categoriaSeleccionada.value)
  return productos.value.filter(p => {
    const catId = p.producto?.categoria_id ?? p.categoria_id ?? p.categoriaId
    return catId === id
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
  <main class="home-page">
    <nav class="breadcrumb">
      <!--<router-link to="/select" class="breadcrumb-item">Inicio</router-link>
      <span class="breadcrumb-separator">/</span>-->
      <router-link to="/bodega" class="breadcrumb-item">Categorías Bodega</router-link>
      <span class="breadcrumb-separator">/</span>
      <span class="breadcrumb-current">{{ categoria?.nombre || 'Cargando...' }}</span>
    </nav>
    <section>
      <h1 class="main-title">Productos</h1>
      <div v-if="loading">Cargando productos...</div>
      <div v-else>
        <section v-if="productosFiltrados().length" class="actions">
          <div v-for="prod in productosFiltrados()" :key="prod.id" class="card">
            <h2>{{ prod.producto?.nombre }}</h2>
            <p>{{ prod.rollos }} {{ prod.medida_gru }}</p>
            <p v-if="prod.cantidad !== prod.rollos">{{ prod.cantidad }} {{ prod.medida_ind }}</p>
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
  padding: 0 2rem;
}

.card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.07);
  padding: 32px 24px;
  width: 260px;
  text-align: center;
  transition: transform 0.15s;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.card:hover {
  transform: translateY(-6px) scale(1.03);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
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
</style>
