<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import api from 'src/api/axios';
import { usePedidosStore, type ProductoPedido } from 'src/stores/pedidos-store';
import { useQuasar } from 'quasar';
import { useAuthStore } from 'src/stores/auth';
import { socket } from 'src/boot/socket';

interface Producto {
  id: number;
  producto_id?: number;
  bodega_id: number;
  producto?: {
    id?: number;
    nombre: string;
    categoria_id: number;
  };
  categoria_id?: number;
  categoriaId?: number;
  rollos: number;
  cantidad: number;
  medida_gru: string;
  medida_ind: string;
  precio: number;
  precio_tap: number;
  // New fields for card design
  detalles?: Array<{
    cantidad: number;
    estado: string;
    [key: string]: unknown;
  }>;
  showDetails?: boolean;
}

interface ProductoRaw {
  id: number;
  producto_id?: number;
  nombre?: string;
  precio?: number;
  producto?: {
    id?: number;
    precio: number;
    precio_tap: number;
    nombre?: string;
  };
  // Allow other properties to pass through
  [key: string]: unknown;
}

interface Categoria {
  id: number;
  nombre: string;
}

interface ProductoConCantidad extends Producto {
  cantidadPedido: number;
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

const props = defineProps({
  categoryId: {
    type: [String, Number],
    default: '',
  },
  descripcion: {
    type: String,
    default: '',
  },
});

const $q = useQuasar();
const pedidosStore = usePedidosStore();

const productos = ref<ProductoConCantidad[]>([]);
const categoria = ref<Categoria | null>(null);
const categoriaSeleccionada = ref<string | number>('');
const loading = ref(false);

const formatNumber = (val: number | string | undefined | null) => {
  if (val === null || val === undefined) return '0';
  return Number(val).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};
const enviandoPedido = ref(false);
const datos = ref<{ email?: string } | null>(null);
const nombreCliente = ref<string>('');
const authStore = useAuthStore();
const isRestoring = ref(false);
const showAllSelected = ref(false);

const floatingPos = ref({ x: 0, y: 0 });
const isDragging = ref(false);
const editOrderId = ref<number | null>(null);
const esPrecioTap = ref(false);

interface PanDetails {
  delta?: { x?: number; y?: number };
  isFirst?: boolean;
  isFinal?: boolean;
}

const handlePan = (details: PanDetails) => {
  if (details.isFirst) {
    isDragging.value = true;
  }
  if (details.delta) {
    floatingPos.value.x += details.delta.x || 0;
    floatingPos.value.y += details.delta.y || 0;
  }
  if (details.isFinal) {
    isDragging.value = false;
  }
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

const cargarProductos = async () => {
  loading.value = true;
  try {
    const res = await api.get('inventarios');
    const items = Array.isArray(res.data) ? res.data : (res.data.items ?? []);
    productos.value = items.map((p: ProductoRaw) => {
      const prodObj = (p.producto || {}) as ProductoRaw;
      return {
        ...p,
        precio: Number(p.precio ?? prodObj.precio ?? 0),
        precio_tap: Number(p.precio_tap ?? prodObj.precio_tap ?? 0),
        producto: {
          ...prodObj,
          nombre: prodObj.nombre || p.nombre || 'Sin Nombre',
        },
        cantidadPedido: 0,
        showDetails: false,
      } as unknown as ProductoConCantidad;
    });
    // Después de cargar productos intentamos restaurar cantidades desde sessionStorage
    restaurarTemporal();
  } catch (err) {
    console.error('Error cargando productos', err);
    productos.value = [];
  } finally {
    loading.value = false;
  }
};

const cargarCategoria = async () => {
  if (!props.categoryId) return;
  try {
    const res = await api.get(`categorias/${props.categoryId}`);
    categoria.value = res.data;
  } catch (err) {
    console.error('Error cargando categoría', err);
  }
};

const productosFiltrados = () => {
  if (!categoriaSeleccionada.value) return productos.value.filter((p) => p.bodega_id === 1);
  const id = Number(categoriaSeleccionada.value);
  return productos.value.filter((p) => {
    const catId = p.producto?.categoria_id ?? p.categoria_id ?? p.categoriaId;
    return catId === id && p.bodega_id === 1;
  });
};

const productosSeleccionados = computed(() => {
  return productos.value.filter((p) => p.cantidadPedido > 0 && p.bodega_id === 1);
});

const hayProductosSeleccionados = computed(() => {
  return productosSeleccionados.value.length > 0 || (cartFromStorage.value?.length > 0);
});

const cartFromStorage = ref<SelectionItem[]>([]);

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

const incrementarCantidad = (prod: ProductoConCantidad) => {
  const max = prod.cantidad;
  if (prod.cantidadPedido < max) {
    prod.cantidadPedido = prod.cantidadPedido + 0.5;
  }
};

const decrementarCantidad = (prod: ProductoConCantidad) => {
  if (prod.cantidadPedido > 0) {
    prod.cantidadPedido = prod.cantidadPedido - 0.5;
  }
};

const enviarPedido = async () => {
  if (!hayProductosSeleccionados.value) {
    $q.notify({
      message: 'Debes seleccionar al menos un producto',
      color: 'warning',
      icon: 'warning',
      position: 'top',
    });
    return;
  }

  if (!nombreCliente.value.trim()) {
    $q.notify({
      message: 'Ingresa el nombre del cliente',
      color: 'warning',
      icon: 'warning',
      position: 'top',
    });
    return;
  }

  enviandoPedido.value = true;
  try {
    const comprador = nombreCliente.value.trim();

    const productosParaPedido: ProductoPedido[] = summaryItems.value.map((p) => ({
      productoId: p.productoId,
      nombre: p.nombre || 'Producto',
      cantidad: p.cantidadPedido,
      medida: p.medida || 'Unidad',
    }));

    const pedido = {
      comprador,
      productos: productosParaPedido,
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

    console.log('--- PEDIDO PROCESADO ---', created);

    // Notificar por socket
    socket.emit(isEditing ? 'pedido-actualizado' : 'nuevo-pedido', created);

    // Limpiar almacenamiento temporal y estado local
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem('edit_order_id');

    productos.value.forEach((p) => {
      p.cantidadPedido = 0;
    });
    nombreCliente.value = '';
    showAllSelected.value = false;
    editOrderId.value = null;
    cartFromStorage.value = [];

    $q.notify({
      message: isEditing ? '¡Pedido actualizado exitosamente!' : '¡Pedido enviado exitosamente!',
      color: 'positive',
      icon: 'check_circle',
      position: 'top',
    });
  } catch (err: unknown) {
    console.error('Error detallado procesando pedido:', err);
    let errorMsg = 'Error desconocido';

    interface ApiError {
      response?: {
        data?: {
          error?: string;
        };
      };
      message?: string;
    }

    if (err && typeof err === 'object' && ('response' in err || 'message' in err)) {
      const error = err as ApiError;
      errorMsg = error.response?.data?.error || error.message || errorMsg;
    } else if (err instanceof Error) {
      errorMsg = err.message;
    }
    $q.notify({
      message: 'Fallo al enviar: ' + errorMsg,
      color: 'negative',
      icon: 'error',
      position: 'top',
      timeout: 0,
      actions: [{ label: 'Cerrar', color: 'white' }]
    });
  } finally {
    enviandoPedido.value = false;
  }
};

const vaciarCarrito = () => {
  productos.value.forEach((p) => {
    p.cantidadPedido = 0;
  });
  cartFromStorage.value = [];
  guardarTemporal();
  $q.notify({
    message: 'Carrito vaciado',
    color: 'info',
    icon: 'info',
    position: 'top',
  });
};
// Logic consolidated in handleClose

// Persistencia temporal del pedido (nombre y cantidades) en sessionStorage
const STORAGE_KEY = 'pedido_temp';

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

    if (data?.nombreCliente) {
      nombreCliente.value = data.nombreCliente;
    }
    if (data?.editOrderId) {
      editOrderId.value = data.editOrderId;
    }
    if (data?.floatingPos) floatingPos.value = data.floatingPos;
    if (Array.isArray(data?.seleccion)) {
      // Create a map for quick lookup of current products by productoId
      const productosMap = new Map<number, ProductoConCantidad>();
      productos.value.forEach(p => {
        const pId = Number(p.producto_id ?? p.producto?.id);
        if (pId) productosMap.set(pId, p);
      });

      const restoredCart: SelectionItem[] = [];
      data.seleccion.forEach((s: SelectionItem) => {
        const sProductoId = Number(s.productoId);
        const prod = productosMap.get(sProductoId);

        if (prod && prod.bodega_id === 1) {
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

    // Pequeño delay para dejar que el watch sepa que no debe guardar mientras restauramos
    setTimeout(() => {
      isRestoring.value = false;
    }, 100);

  } catch (err) {
    console.error('Error restaurando temporal:', err);
    isRestoring.value = false;
  }
};

// Vigilar cambios para guardar temporalmente
watch(productos, () => guardarTemporal(), { deep: true });
watch(nombreCliente, () => guardarTemporal());
watch(cartFromStorage, () => guardarTemporal(), { deep: true });


// Inicialización
onMounted(async () => {
  const datosString = sessionStorage.getItem('user_data');
  if (datosString) {
    datos.value = JSON.parse(datosString);
  }

  if (props.categoryId) {
    categoriaSeleccionada.value = props.categoryId;
  }
  void cargarCategoria();
  await cargarProductos();
  // asegurar que si el store de auth ya tiene user lo asignamos
  datos.value = authStore.user;
});

watch(
  () => props.categoryId,
  (newVal) => {
    if (newVal) {
      categoriaSeleccionada.value = newVal;
    }
  },
);
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
      <!-- Floating Order Summary -->
      <div v-if="hayProductosSeleccionados" class="floating-summary" :style="{
        transform: `translate(calc(-50% + ${floatingPos.x}px), ${floatingPos.y}px)`
      }">
        <div class="summary-header">
          <div class="drag-handle" v-touch-pan.prev.stop="handlePan"
            :style="{ cursor: isDragging ? 'grabbing' : 'grab' }">
            <div class="handle-bar"></div>
          </div>
          <div class="header-main row items-center justify-between no-wrap q-px-md">
            <div class="header-title">
              <div v-if="editOrderId" class="edit-pill">EDITANDO PEDIDO #{{ editOrderId }}</div>
              <div v-else class="summary-title text-weight-bold">RESUMEN DEL PEDIDO</div>
            </div>
            <q-btn icon="close" flat round dense color="grey-7" @click.stop="handleClose">
              <q-tooltip>{{ editOrderId ? 'Cancelar Edición' : 'Limpiar Pedido' }}</q-tooltip>
            </q-btn>
          </div>
        </div>

        <div class="summary-body">
          <!-- Client & Settings Group -->
          <div class="settings-group q-pa-md bg-grey-1">
            <q-input v-model="nombreCliente" placeholder="Nombre del Cliente" dense outlined
              class="client-input q-mb-sm" bg-color="white">
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
              <span class="text-h6 text-primary text-weight-bolder gradient-text">${{ formatNumber(totalPedido)
              }}</span>
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

      <div v-if="loading">Cargando productos...</div>
      <div v-else>
        <section v-if="productosFiltrados().length" class="actions">
          <div v-for="prod in productosFiltrados()" :key="prod.id" class="card"
            :class="{ 'card-selected': prod.cantidadPedido > 0 }">
            <!-- Header -->
            <div class="card-header">
              <h3>{{ prod.producto?.nombre }}</h3>
            </div>

            <div class="card-body">
              <!-- Badge for Rolls/Group Measure -->
              <div v-if="prod.rollos !== prod.cantidad" class="badge-group">
                <span class="badge-icon">📦</span>
                <span class="badge-text">{{ formatNumber(prod.rollos) }} {{ prod.medida_gru }}</span>
              </div>

              <!-- Main Quantity Display -->
              <div class="stat-main">
                <span class="stat-value">{{ formatNumber(prod.cantidad) }}</span>
                <span class="stat-unit">{{ prod.medida_ind }}</span>
              </div>

              <!-- Quantity Control (Vendedor only) -->
              <div class="quantity-control" v-if="datos?.email === 'vendedor'">
                <button @click="decrementarCantidad(prod)" class="btn-qty" :disabled="prod.cantidadPedido === 0">
                  -
                </button>
                <input type="number" v-model.number="prod.cantidadPedido" inputmode="decimal" min="0" step="any"
                  :max="prod.cantidad" class="qty-input" />
                <button @click="incrementarCantidad(prod)" class="btn-qty"
                  :disabled="prod.cantidadPedido >= prod.cantidad">
                  +
                </button>
              </div>
              <div v-if="prod.cantidadPedido > 0" class="selected-badge">✓ Seleccionado</div>

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
                  <span class="detail-status" :class="detalle.estado?.toLowerCase()">{{
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
  padding: 0 2rem 120px 2rem;
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

.card-selected {
  border-color: #4caf50;
  background: #f0f9f0;
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
  border: 1px solid #cce2ff;
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

.quantity-control {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  justify-content: center;
  padding-top: 0.5rem;
  border-top: 1px solid #f1f5f9;
}

.btn-qty {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #ffd54f 0%, #8b5e3c 100%);
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
  margin-top: 0.5rem;
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
  color: white;
  border-radius: 20px;
  font-size: 0.9rem;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
}

.card-footer {
  margin-top: 1rem;
  width: 100%;
}

.btn-details {
  background: transparent;
  border: 1px solid #e2e8f0;
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

.order-items-list {
  background: #f8fafc;
  border-radius: 12px;
  max-height: 200px;
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

  .actions {
    grid-template-columns: 1fr;
  }

  .main-title {
    font-size: 2rem;
  }
}
</style>
