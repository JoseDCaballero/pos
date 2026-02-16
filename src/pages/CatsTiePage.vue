<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from 'src/api/axios';
import { usePedidosStore } from 'src/stores/pedidos-store';
import { useQuasar } from 'quasar';
import { useAuthStore } from 'src/stores/auth';
import { socket } from 'src/boot/socket';
import { computed, watch } from 'vue';

interface Categoria {
  id: number;
  nombre: string;
  descripcion: string;
}

interface Producto {
  id: number;
  producto_id?: number;
  bodega_id: number;
  producto?: {
    id?: number;
    nombre: string;
  };
  precio: number;
  precio_tap: number;
  cantidad: number;
  medida_ind: string;
  cantidadPedido: number;
}

interface ProductoRaw {
  id: number;
  producto_id?: number;
  nombre?: string;
  precio?: number;
  producto?: {
    id?: number;
    precio?: number;
    precio_tap?: number;
    nombre?: string;
  };
  [key: string]: unknown;
}

interface SelectionItem {
  id: number;
  productoId: number;
  cantidadPedido: number;
  nombre: string | undefined;
  precio: number | undefined;
  precio_tap: number | undefined;
  medida: string | undefined;
  isCurrent?: boolean;
  stock?: number;
}

const categorias = ref<Categoria[]>([]);
const loading = ref(false);

const $q = useQuasar();
const pedidosStore = usePedidosStore();
const authStore = useAuthStore();

const formatNumber = (val: number | string | undefined | null) => {
  if (val === null || val === undefined) return '0';
  return Number(val).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

const productos = ref<Producto[]>([]);
const nombreCliente = ref<string>('');
const isRestoring = ref(false);
const showAllSelected = ref(false);
const editOrderId = ref<number | null>(null);
const esPrecioTap = ref(false);
const enviandoPedido = ref(false);
const datos = ref<{ email: string } | null>(null);

const floatingPos = ref({ x: 0, y: 0 });
const isDragging = ref(false);
const cartFromStorage = ref<SelectionItem[]>([]);

const STORAGE_KEY = 'pedido_temp';

const handlePan = (details: { delta?: { x?: number; y?: number }; isFirst?: boolean; isFinal?: boolean }) => {
  if (details.isFirst) isDragging.value = true;
  if (details.delta) {
    floatingPos.value.x += details.delta.x || 0;
    floatingPos.value.y += details.delta.y || 0;
  }
  if (details.isFinal) isDragging.value = false;
};

const productosSeleccionados = computed(() => {
  return productos.value.filter((p) => p.cantidadPedido > 0 && p.bodega_id === 1);
});

const hayProductosSeleccionados = computed(() => {
  return productosSeleccionados.value.length > 0 || cartFromStorage.value?.length > 0;
});

const totalPedido = computed(() => {
  return summaryItems.value.reduce((sum, p) => {
    const price = esPrecioTap.value ? (p.precio_tap ?? 0) : (p.precio || 0);
    return sum + (p.cantidadPedido * price);
  }, 0);
});

const summaryItems = computed(() => {
  const itemsMap = new Map<number, SelectionItem>();

  cartFromStorage.value.forEach(s => {
    itemsMap.set(s.productoId, { ...s, isCurrent: false });
  });

  productosSeleccionados.value.forEach(p => {
    const pId = Number(p.producto_id ?? p.producto?.id);
    itemsMap.set(pId, {
      id: p.id,
      productoId: pId,
      nombre: p.producto?.nombre,
      cantidadPedido: p.cantidadPedido,
      medida: p.medida_ind,
      precio: p.precio,
      precio_tap: p.precio_tap,
      isCurrent: true,
      stock: Number(p.cantidad)
    });
  });

  return Array.from(itemsMap.values());
});

const mostrarExistencias = async () => {
  loading.value = true;
  try {
    const res = await api.get('inventarios');
    const items = Array.isArray(res.data) ? res.data : (res.data.items ?? []);
    productos.value = items.map((p: ProductoRaw) => {
      const prodObj = p.producto || {};
      return {
        ...p,
        precio: Number(p.precio ?? prodObj.precio ?? 0),
        precio_tap: Number(p.precio_tap ?? prodObj.precio_tap ?? 0),
        producto: {
          ...prodObj,
          nombre: prodObj.nombre || p.nombre || 'Sin Nombre',
        },
        cantidadPedido: 0,
      } as Producto;
    });
    restaurarTemporal();
  } catch (err) {
    console.error('Error al obtener las existencias:', err);
  } finally {
    loading.value = false;
  }
};

const cargarCategorias = async () => {
  try {
    const response = await api.get('categorias');
    categorias.value = response.data;
  } catch (err) {
    console.error('Error al cargar categorías', err);
  }
};

const guardarTemporal = () => {
  if (isRestoring.value) return;
  try {
    const payload = {
      nombreCliente: nombreCliente.value,
      seleccion: summaryItems.value,
      editOrderId: editOrderId.value,
      floatingPos: floatingPos.value,
      esPrecioTap: esPrecioTap.value
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.error('Error guardando temporal:', err);
  }
};

const restaurarTemporal = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    isRestoring.value = true;
    if (data?.nombreCliente) nombreCliente.value = data.nombreCliente;
    if (data?.editOrderId) editOrderId.value = data.editOrderId;
    if (data?.floatingPos) floatingPos.value = data.floatingPos;
    if (data?.esPrecioTap !== undefined) esPrecioTap.value = data.esPrecioTap;
    if (Array.isArray(data?.seleccion)) {
      const restoredCart: SelectionItem[] = [];
      data.seleccion.forEach((s: SelectionItem) => {
        const sProductoId = Number(s.productoId);
        const prod = productos.value.find((p: Producto) =>
          (p.id === s.id || Number(p.producto_id ?? p.producto?.id) === sProductoId)
          && p.bodega_id === 1
        );
        if (prod) {
          prod.cantidadPedido = Math.min(s.cantidadPedido, Number(prod.cantidad));
          restoredCart.push({
            id: prod.id,
            productoId: sProductoId,
            cantidadPedido: prod.cantidadPedido,
            nombre: prod.producto?.nombre || s.nombre,
            precio: prod.precio ?? s.precio,
            precio_tap: prod.precio_tap ?? s.precio_tap,
            medida: prod.medida_ind || s.medida,
          });
        } else {
          restoredCart.push({
            id: s.id,
            productoId: sProductoId,
            cantidadPedido: s.cantidadPedido,
            nombre: s.nombre,
            precio: s.precio,
            precio_tap: s.precio_tap,
            medida: s.medida,
          });
        }
      });
      cartFromStorage.value = restoredCart;
    }
    setTimeout(() => { isRestoring.value = false; }, 100);
  } catch (err) {
    console.error('Error restaurando temporal:', err);
    isRestoring.value = false;
  }
};

const enviarPedido = async () => {
  if (!hayProductosSeleccionados.value || !nombreCliente.value.trim()) return;
  enviandoPedido.value = true;
  try {
    const pedido = {
      comprador: nombreCliente.value.trim(),
      productos: summaryItems.value.map((p) => ({
        productoId: Number(p.productoId),
        nombre: p.nombre || 'Producto',
        cantidad: p.cantidadPedido,
        medida: p.medida || 'Unidad',
      })),
      estado: 'pendiente' as const,
      total: totalPedido.value,
    };
    const isEditing = !!editOrderId.value;
    const created = editOrderId.value
      ? await pedidosStore.actualizarPedido(editOrderId.value, {
        ...pedido,
        comentarios: esPrecioTap.value ? 'PRECIO TAPICERO' : ''
      })
      : await pedidosStore.agregarPedido({
        ...pedido,
        comentarios: esPrecioTap.value ? 'PRECIO TAPICERO' : ''
      });
    socket.emit(isEditing ? 'pedido-actualizado' : 'nuevo-pedido', created);
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem('edit_order_id');
    productos.value.forEach((p) => { p.cantidadPedido = 0; });
    nombreCliente.value = '';
    showAllSelected.value = false;
    editOrderId.value = null;
    cartFromStorage.value = [];
    esPrecioTap.value = false;
    $q.notify({ message: isEditing ? '¡Pedido actualizado exitosamente!' : '¡Procesado exitosamente!', color: 'positive' });
  } catch (err) {
    console.error('Error enviando pedido:', err);
  } finally {
    enviandoPedido.value = false;
  }
};

const vaciarCarrito = () => {
  productos.value.forEach((p) => { p.cantidadPedido = 0; });
  cartFromStorage.value = [];
  guardarTemporal();
  $q.notify({ message: 'Carrito vaciado', color: 'info', icon: 'info' });
};

const handleClose = () => {
  const isEditing = !!editOrderId.value;
  $q.dialog({
    title: isEditing ? 'Cancelar Edición' : 'Limpiar Pedido',
    message: isEditing
      ? '¿Estás seguro de que deseas cancelar la edición? Se perderán los cambios.'
      : '¿Estás seguro de que deseas vaciar el carrito y limpiar los datos?',
    cancel: true,
    persistent: true
  }).onOk(() => {
    isRestoring.value = true;
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem('edit_order_id');
    editOrderId.value = null;
    cartFromStorage.value = [];
    productos.value.forEach((p) => { p.cantidadPedido = 0; });
    productos.value = [...productos.value];
    nombreCliente.value = '';
    esPrecioTap.value = false;
    showAllSelected.value = false;
    setTimeout(() => { isRestoring.value = false; }, 200);
    $q.notify({
      message: isEditing ? 'Edición cancelada' : 'Pedido limpiado',
      color: 'info'
    });
  });
};

const removeItem = (pId: number) => {
  const prod = productos.value.find(p => Number(p.producto_id ?? p.producto?.id) === pId);
  if (prod) {
    prod.cantidadPedido = 0;
  }
  cartFromStorage.value = cartFromStorage.value.filter(item => item.productoId !== pId);
  guardarTemporal();
};

const updateItemQty = (pId: number, delta: number) => {
  const prod = productos.value.find(p => Number(p.producto_id ?? p.producto?.id) === pId);
  if (prod) {
    const newVal = Math.max(0, Math.min(Number(prod.cantidad), prod.cantidadPedido + delta));
    prod.cantidadPedido = newVal;
  } else {
    const item = cartFromStorage.value.find(s => s.productoId === pId);
    if (item) {
      item.cantidadPedido = Math.max(0, item.cantidadPedido + delta);
      cartFromStorage.value = [...cartFromStorage.value];
      guardarTemporal();
    }
  }
};

watch(productos, () => guardarTemporal(), { deep: true });
watch(nombreCliente, () => guardarTemporal());

onMounted(() => {
  datos.value = authStore.user as { email: string };
  void cargarCategorias();
  void mostrarExistencias();
});
</script>

<template>
  <main class="home-page">
    <nav class="breadcrumb">
      <!--<router-link to="/select" class="breadcrumb-item">Inicio</router-link>
      <span class="breadcrumb-separator">/</span>-->
      <span class="breadcrumb-current">Categorías Tienda</span>
    </nav>
    <h1 class="main-title">Existencias</h1>
    <section class="actions">
      <router-link v-for="cat in categorias" :key="cat.id"
        :to="{ name: 'ConfiguracionPorCategoriaTienda', params: { categoryId: cat.id }, query: { descripcion: cat.descripcion } }"
        class="card">
        <p class="sections">{{ cat.nombre }}</p>
      </router-link>
    </section>

    <!-- Floating Order Summary -->
    <div v-if="hayProductosSeleccionados" class="floating-summary"
      :style="{ transform: `translate(calc(-50% + ${floatingPos.x}px), ${floatingPos.y}px)` }">

      <div class="summary-header">
        <div class="drag-handle" v-touch-pan.prev.stop="handlePan"
          :style="{ cursor: isDragging ? 'grabbing' : 'grab' }">
          <div class="handle-bar"></div>
        </div>
        <div class="header-main row items-center justify-between no-wrap q-px-md">
          <div class="header-title">
            <div v-if="editOrderId" class="edit-pill">EDITANDO PEDIDO #{{ editOrderId }}</div>
            <div v-else class="summary-title text-weight-bold text-grey-7">RESUMEN DEL PEDIDO</div>
          </div>
          <q-btn icon="close" flat round dense color="grey-7" @click.stop="handleClose">
            <q-tooltip>{{ editOrderId ? 'Cancelar Edición' : 'Limpiar Pedido' }}</q-tooltip>
          </q-btn>
        </div>
      </div>

      <div class="summary-body">
        <!-- Client & Settings Group -->
        <div class="settings-group q-pa-md bg-grey-1">
          <q-input v-model="nombreCliente" placeholder="Nombre del Cliente" dense outlined class="client-input q-mb-sm"
            bg-color="white">
            <template v-slot:prepend>
              <q-icon name="person" color="primary" />
            </template>
          </q-input>
          <div class="row items-center justify-between">
            <q-toggle v-model="esPrecioTap" label="Precio Tapicero" color="brown" dense class="text-weight-medium" />
            <q-btn v-if="summaryItems.length > 0" :label="showAllSelected ? 'Ocultar Lista' : 'Ver Productos'"
              :icon="showAllSelected ? 'expand_less' : 'list'" flat dense no-caps size="sm" color="primary"
              @click="showAllSelected = !showAllSelected" />
          </div>
        </div>

        <!-- Selection List -->
        <div v-if="showAllSelected" class="order-items-list q-pa-sm scroll">
          <div v-for="p in summaryItems" :key="p.productoId" class="order-item q-mb-xs">
            <div class="item-main row items-center justify-between no-wrap">
              <div class="item-info col">
                <div class="item-name text-weight-bold">{{ p.nombre }}</div>
                <div class="item-meta text-caption text-grey-7" v-if="!p.isCurrent">Otra categoría</div>
              </div>
              <div class="item-qty-zone row items-center no-wrap">
                <div class="qty-control row items-center no-wrap">
                  <q-btn icon="remove" flat round dense size="xs" color="primary"
                    @click="updateItemQty(p.productoId, -0.5)" />
                  <span class="qty-val text-weight-bolder q-px-xs">{{ p.cantidadPedido }}</span>
                  <q-btn icon="add" flat round dense size="xs" color="primary"
                    @click="updateItemQty(p.productoId, 0.5)" />
                </div>
                <span class="unit-label q-ml-xs text-caption text-weight-medium">{{ p.medida }}</span>
                <q-btn icon="delete" flat round dense color="negative" size="xs" @click="removeItem(p.productoId)"
                  class="q-ml-xs" />
              </div>
            </div>
          </div>
        </div>

        <!-- Total & Actions -->
        <div class="summary-footer q-pa-md border-top">
          <div class="row justify-between items-center q-mb-md">
            <span class="text-subtitle1 text-weight-bold">Total:</span>
            <span class="text-h6 text-primary text-weight-bolder gradient-text">${{ formatNumber(totalPedido) }}</span>
          </div>
          <div class="row q-col-gutter-sm no-wrap">
            <div class="col-4">
              <q-btn label="Vaciar" color="grey-4" text-color="grey-9" unelevated class="full-width"
                @click="vaciarCarrito" no-caps />
            </div>
            <div class="col-8">
              <q-btn :label="enviandoPedido ? 'Enviando...' : (editOrderId ? 'Guardar Cambios' : 'Enviar Pedido')"
                color="primary" unelevated class="full-width text-weight-bold btn-gradient" :loading="enviandoPedido"
                :disabled="!hayProductosSeleccionados || !nombreCliente.trim()" @click="enviarPedido" no-caps />
            </div>
          </div>
        </div>
      </div>
    </div>
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

/* Floating Summary Styles */
.floating-summary {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  background: white;
  border-radius: 20px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.2);
  padding: 0 1.5rem 1.5rem 1.5rem;
  z-index: 1000;
  min-width: 420px;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.drag-handle {
  width: 100%;
  padding: 12px 0;
  display: flex;
  justify-content: center;
  align-items: center;
  touch-action: none;
  border-bottom: 1px solid #f1f5f9;
  margin-bottom: 1rem;
}

.handle-bar {
  width: 40px;
  height: 4px;
  background: #e2e8f0;
  border-radius: 2px;
}

.edit-badge {
  background: #3b82f6;
  color: white;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  text-align: center;
}

.summary-content {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.summary-header-box {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-btns {
  display: flex;
  gap: 0.5rem;
}

.btn-reset,
.btn-toggle-list {
  padding: 4px 10px;
  font-size: 0.75rem;
  border-radius: 6px;
  border: none;
  cursor: pointer;
}

.btn-reset {
  background: #ff9800;
  color: white;
}

.btn-toggle-list {
  background: #f1f5f9;
  color: #64748b;
}

.btn-toggle-list.btn-active {
  background: #3b82f6;
  color: white;
}

.order-items-list {
  background: #f8fafc;
  border-radius: 12px;
  max-height: 200px;
}

.floating-summary {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  background: white;
  border-radius: 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  min-width: 400px;
  max-width: 90vw;
  border: 1px solid rgba(0, 0, 0, 0.05);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.summary-header {
  border-bottom: 1px solid #f1f5f9;
}

.drag-handle {
  width: 100%;
  padding: 8px 0;
  display: flex;
  justify-content: center;
  align-items: center;
  touch-action: none;
}

.handle-bar {
  width: 32px;
  height: 4px;
  background: linear-gradient(90deg, #FFD54F 0%, #8B5E3C 100%);
  border-radius: 2px;
}

.header-main {
  padding-bottom: 12px;
}

.summary-title {
  font-size: 0.85rem;
  letter-spacing: 0.05em;
  color: #64748b;
  text-transform: uppercase;
}

.edit-pill {
  background: linear-gradient(90deg, #FFD54F 0%, #8B5E3C 100%);
  color: white;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
}

.summary-body {
  max-height: 60vh;
}

.order-item {
  background: white;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid #f1f5f9;
}

.item-name {
  font-size: 0.9rem;
  line-height: 1.2;
}

.qty-control {
  background: #f1f5f9;
  border-radius: 8px;
  padding: 2px;
}

.qty-val {
  min-width: 30px;
  text-align: center;
  font-size: 0.9rem;
}

.unit-label {
  color: #64748b;
  min-width: 35px;
}

.summary-footer {
  border-top: 1px solid #f1f5f9;
}

.border-top {
  border-top: 1px solid #f1f5f9;
}

.gradient-text {
  background: linear-gradient(90deg, #FFD54F 0%, #8B5E3C 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  display: inline-block;
}

.btn-gradient {
  background: linear-gradient(90deg, #FFD54F 0%, #8B5E3C 100%) !important;
  color: white !important;
}

.home-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  padding-bottom: 2rem;
}
</style>
