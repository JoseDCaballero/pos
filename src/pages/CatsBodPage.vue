<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';

interface Categoria {
  id: number
  nombre: string
}

const existencias = ref<unknown[]>([]);
const categorias = ref<Categoria[]>([]);
const loading = ref(false);

const mostrarExistencias = async () => {
  try {
    const res = await axios.get(import.meta.env.VITE_API + 'inventarios');
    existencias.value = res.data;
    loading.value = true;
  } catch (err) {
    console.error('Error al obtener las existencias:', err);
  }
};

const cargarCategorias = async () => {
  try {
    const response = await axios.get(import.meta.env.VITE_API + 'categorias');
    categorias.value = response.data;
  } catch (err) {
    console.error('Error al cargar categorías', err);
  }
};

onMounted(() => {
  void cargarCategorias();
  void mostrarExistencias();
});
</script>

<template>
  <main class="home-page">
    <nav class="breadcrumb">
      <!--<router-link to="/select" class="breadcrumb-item">Inicio</router-link>
      <span class="breadcrumb-separator">/</span>-->
      <span class="breadcrumb-current">Categorías Bodega</span>
    </nav>
    <h1 class="main-title">Existencias</h1>
    <section class="actions">
      <router-link v-for="cat in categorias" :key="cat.id"
        :to="{ name: 'ConfiguracionPorCategoria', params: { categoryId: cat.id } }" class="card">
        <p class="sections">{{ cat.nombre }}</p>
      </router-link>
    </section>
  </main>
</template>

<style scoped>
.main-title {
  text-align: center;
  margin-top: 24px;
  font-size: 2.5rem;
  color: #333;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 32px;
  margin: 40px 0;
  flex-wrap: wrap;
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
  text-decoration: none;
  color: inherit;
  cursor: pointer;
}

.card:hover {
  transform: translateY(-6px) scale(1.03);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.home-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  font-family: 'Segoe UI', Arial, sans-serif;
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

.sections {
  font-size: 1.25rem;
  font-weight: 600;
}
</style>
