<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import api from 'src/api/axios';
import { useQuasar, date } from 'quasar';
import ReceiptPrinter from 'src/components/ReceiptPrinter.vue';
import type { ReceiptData } from 'src/components/types';

// Interfaces based on API introspection
interface DetalleVenta {
  id: number;
  producto_id: number;
  cantidad: number;
  precio_unitario: number;
  medida?: string; // Unit type (metros, UNID, etc.)
  producto?: {
    nombre: string;
  };
}

interface Venta {
  id: number;
  fecha_venta: string;
  cliente: string | null;
  total: number;
  comentarios: string | null;
  metodo_pago: string;
  detallesVenta: DetalleVenta[];
}

const $q = useQuasar();
const ventas = ref<Venta[]>([]);
const loading = ref(true);
const productosMap = ref<Map<number, string>>(new Map());
const receiptPrinter = ref<InstanceType<typeof ReceiptPrinter> | null>(null);
const lastReceipt = ref<ReceiptData | null>(null);

const formatCurrency = (amount: number | string | undefined | null) => {
  if (amount === undefined || amount === null) return '$0.00';
  return Number(amount).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
};

const formatNumber = (val: number | undefined | null) => {
  if (val === undefined || val === null) return '0.00';
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatTime = (dateString: string | undefined | null) => {
  if (!dateString) return '';
  return date.formatDate(dateString, 'HH:mm A');
};

const todayDate = computed(() => date.formatDate(Date.now(), 'DD/MM/YYYY'));

const parseDetailedPaymentComment = (rawComment: string | null): {
  comments: string;
  pagoDetalle?: ReceiptData['pagoDetalle'];
} => {
  const comment = rawComment ?? '';
  const detailMatch = comment.match(/\[Detalle Pago:([^\]]+)\]/i);

  if (!detailMatch || !detailMatch[1]) {
    return { comments: comment.trim() };
  }

  const detailText = detailMatch[1];

  const parseAmount = (regex: RegExp): number => {
    const match = detailText.match(regex);
    if (!match || !match[1]) return 0;
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : 0;
  };

  const efectivo = parseAmount(/Pesos:\s*\$([\d.]+)/i);
  const dolares = parseAmount(/USD:\s*([\d.]+)/i);
  const tasaCambio = parseAmount(/\(Tasa:\s*([\d.]+)\)/i);
  const tarjeta = parseAmount(/Tarjeta:\s*\$([\d.]+)/i);
  const transferencia = parseAmount(/Transf:\s*\$([\d.]+)/i);
  const totalPagado = efectivo + tarjeta + transferencia + (dolares * tasaCambio);

  const cleanedComment = comment
    .replace(detailMatch[0], '')
    .trim();

  return {
    comments: cleanedComment,
    pagoDetalle: {
      efectivo,
      tarjeta,
      transferencia,
      dolares,
      tasaCambio,
      totalPagado: Number(totalPagado.toFixed(2)),
    }
  };
};

const buildLastReceiptFromVenta = (venta: Venta): ReceiptData => {
  const parsed = parseDetailedPaymentComment(venta.comentarios);

  return {
    cliente: (venta.cliente || 'Cliente General').trim(),
    productos: (venta.detallesVenta || []).map((detalle) => ({
      cantidad: Number(detalle.cantidad || 0),
      medida: detalle.medida || 'UNID',
      nombre: getProductoNombre(detalle.producto_id),
      precio_unitario: Number(detalle.precio_unitario || 0),
    })),
    total: Number(venta.total || 0),
    metodoPago: String(venta.metodo_pago || 'EFECTIVO').toUpperCase(),
    fecha: venta.fecha_venta,
    ...(parsed.comments ? { comentarios: parsed.comments } : {}),
    ...(parsed.pagoDetalle ? { pagoDetalle: parsed.pagoDetalle } : {}),
  };
};

const updateLastReceipt = () => {
  const latestSale = ventasHoy.value[0];
  lastReceipt.value = latestSale ? buildLastReceiptFromVenta(latestSale) : null;
};

const loadVentas = async () => {
  loading.value = true;
  try {
    const { data } = await api.get<Venta[]>('ventas');
    ventas.value = data;
    updateLastReceipt();
  } catch (error) {
    console.error(error);
    $q.notify({
      message: 'Error al cargar el historial de ventas',
      color: 'negative',
      icon: 'error'
    });
  } finally {
    loading.value = false;
  }
};

interface InventarioItem {
  producto_id?: number;
  producto?: {
    id?: number;
    nombre?: string;
  };
}

const loadProductos = async () => {
  try {
    const res = await api.get('inventarios');
    const items = Array.isArray(res.data) ? res.data : (res.data.items ?? []);

    // Build a map of producto_id -> nombre
    items.forEach((item: InventarioItem) => {
      const productoId = item.producto_id ?? item.producto?.id;
      const nombre = item.producto?.nombre;
      if (productoId && nombre) {
        productosMap.value.set(productoId, nombre);
      }
    });
    updateLastReceipt();
  } catch (error) {
    console.error('Error al cargar productos:', error);
  }
};

const getProductoNombre = (productoId: number): string => {
  return productosMap.value.get(productoId) || `Producto #${productoId}`;
};

// --- Computed Properties for "Corte del Día" ---

const ventasHoy = computed(() => {
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));

  return ventas.value.filter(v => {
    const vDate = new Date(v.fecha_venta);
    return vDate >= startOfDay && vDate <= endOfDay;
  }).sort((a, b) => new Date(b.fecha_venta).getTime() - new Date(a.fecha_venta).getTime()); // Newest first
});

// Breakdown specific payment methods
const stats = computed(() => {
  let efectivo = 0;
  let tarjeta = 0;
  let transferencia = 0;
  let usd = 0;
  let granTotal = 0; // Calculated total from components

  ventasHoy.value.forEach(v => {
    const comment = v.comentarios || '';
    const total = Number(v.total);
    const metodo = (v.metodo_pago || '').toUpperCase();

    // Check for detailed payment info in comments (from PaymentModal)
    if (comment.includes('[Detalle Pago:')) {
      const parseAmount = (regex: RegExp): number => {
        const match = comment.match(regex);
        if (match && match[1]) {
          return parseFloat(match[1]);
        }
        return 0;
      };

      const pPesos = parseAmount(/Pesos:\s*\$([\d.]+)/);
      const pUSD = parseAmount(/USD:\s*([\d.]+)/);
      const pTasa = parseAmount(/\(Tasa:\s*([\d.]+)\)/) || 0; // Parse rate associated with USD
      const pTarjeta = parseAmount(/Tarjeta:\s*\$([\d.]+)/);
      const pTransf = parseAmount(/Transf:\s*\$([\d.]+)/);

      efectivo += pPesos;
      usd += pUSD;
      tarjeta += pTarjeta;
      transferencia += pTransf;

      // Add to Grand Total
      const usdValueInPesos = pUSD * pTasa;
      granTotal += pPesos + pTarjeta + pTransf + usdValueInPesos;

      return;
    }

    // Standard fallback if no details found
    granTotal += total;
    if (metodo === 'EFECTIVO') {
      efectivo += total;
    } else if (metodo === 'TARJETA') {
      tarjeta += total;
    } else if (metodo === 'TRANSFERENCIA') {
      transferencia += total;
    } else {
      // MIXTO/OTROS without detailed comments
      transferencia += total;
    }
  });

  return { efectivo, tarjeta, transferencia, usd, granTotal };
});

const totalIngresos = computed(() => stats.value.granTotal);

const totalTransacciones = computed(() => ventasHoy.value.length);

onMounted(() => {
  void loadVentas();
  void loadProductos();
});

const printLastReceipt = () => {
  if (!lastReceipt.value) {
    $q.notify({
      message: 'No hay recibos recientes para imprimir',
      color: 'warning',
      icon: 'warning'
    });
    return;
  }

  receiptPrinter.value?.print();
};

const printVenta = async (venta: Venta) => {
  lastReceipt.value = buildLastReceiptFromVenta(venta);
  await nextTick();
  receiptPrinter.value?.print();
};

const formatMoney = (amount: number) => `$${Number(amount || 0).toFixed(2)}`;

const generateDailyReportHTML = () => {
  return `
  <html>
    <head>
      <meta charset="UTF-8" />
      <style>
        html, body {
          width: 58mm;
          margin: 0;
          padding: 0;
        }

        @page {
          size: 58mm auto;
          margin: 0;
        }

        body {
          font-family: monospace;
          font-size: 13px;
          max-width: 58mm;
          padding: 8px;
          box-sizing: border-box;
        }

        .center { text-align: center; }
        .line { border-top: 1px dashed #000; margin: 6px 0; }
        .row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: 3px 0;
        }
        .label { font-weight: bold; }
        .value { text-align: right; }
        .title {
          font-size: 16px;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="center title">REPORTE DEL DÍA</div>
      <div class="center">${todayDate.value}</div>

      <div class="line"></div>

      <div class="row"><span class="label">Ingreso Total:</span><span class="value">${formatMoney(totalIngresos.value)}</span></div>
      <div class="row"><span class="label">Transacciones:</span><span class="value">${totalTransacciones.value}</span></div>

      <div class="line"></div>

      <div class="row"><span class="label">Efectivo:</span><span class="value">${formatMoney(stats.value.efectivo)}</span></div>
      <div class="row"><span class="label">Tarjeta:</span><span class="value">${formatMoney(stats.value.tarjeta)}</span></div>
      <div class="row"><span class="label">Transferencia:</span><span class="value">${formatMoney(stats.value.transferencia)}</span></div>
      <div class="row"><span class="label">Dólares:</span><span class="value">USD ${formatNumber(stats.value.usd)}</span></div>

      <div class="line"></div>
      <div class="center">Generado: ${new Date().toLocaleString()}</div>

      <br><br><br>
    </body>
  </html>
  `;
};

const printDailyReport = async () => {
  try {
    const html = generateDailyReportHTML();

    if (window.pos?.printTicket) {
      await window.pos.printTicket(html);
      return;
    }

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
      return;
    }

    $q.notify({
      message: 'No se pudo abrir la ventana de impresión',
      color: 'negative',
      icon: 'error'
    });
  } catch (error) {
    console.error('Error imprimiendo reporte del día:', error);

    const message = error instanceof Error
      ? error.message
      : 'Error al imprimir el reporte del día';

    $q.notify({
      message,
      color: 'negative',
      icon: 'error'
    });
  }
};
</script>

<template>
  <q-page class="corte-page q-pa-md">
    <!-- Header -->
    <div class="row items-center justify-between q-mb-lg header-section">
      <div>
        <h1 class="text-h4 text-weight-bolder text-grey-9 q-my-none">Corte de Caja</h1>
        <div class="text-subtitle1 text-grey-7">
          Resumen de ventas del día: <span class="text-weight-bold text-primary">{{ todayDate }}</span>
        </div>
      </div>
      <div class="row q-gutter-sm">
        <q-btn icon="print" flat round color="orange-8" @click="printDailyReport">
          <q-tooltip>Imprimir Reporte del Día</q-tooltip>
        </q-btn>
        <q-btn icon="print" flat round color="primary" @click="printLastReceipt" :disable="!lastReceipt">
          <q-tooltip>Imprimir Último Recibo</q-tooltip>
        </q-btn>
        <q-btn icon="refresh" flat round color="primary" @click="loadVentas" :loading="loading">
          <q-tooltip>Actualizar Datos</q-tooltip>
        </q-btn>
      </div>
    </div>

    <!-- Main KPI Cards -->
    <div class="row q-col-gutter-md q-mb-md">
      <!-- Total Income Card -->
      <div class="col-12 col-md-6">
        <div class="kpi-card gradient-bg text-white">
          <div class="kpi-icon">
            <q-icon name="payments" size="2.5rem" />
          </div>
          <div class="kpi-content">
            <div class="kpi-label">Ingreso Total</div>
            <div class="kpi-value">{{ formatCurrency(totalIngresos) }}</div>
          </div>
        </div>
      </div>

      <!-- Transaction Count Card -->
      <div class="col-12 col-md-6">
        <div class="kpi-card bg-white text-grey-9 border-gradient">
          <div class="kpi-icon text-orange-8">
            <q-icon name="receipt_long" size="2.5rem" />
          </div>
          <div class="kpi-content">
            <div class="kpi-label text-grey-6">Transacciones</div>
            <div class="kpi-value">{{ totalTransacciones }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Payment Methods Breakdown Row -->
    <div class="row q-col-gutter-sm q-mb-xl">
      <div class="col-6 col-md-3">
        <div class="mini-stat-card">
          <div class="stat-label text-green-8">
            <q-icon name="attach_money" /> Efectivo
          </div>
          <div class="stat-amount">{{ formatCurrency(stats.efectivo) }}</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="mini-stat-card">
          <div class="stat-label text-blue-8">
            <q-icon name="credit_card" /> Tarjeta
          </div>
          <div class="stat-amount">{{ formatCurrency(stats.tarjeta) }}</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="mini-stat-card">
          <div class="stat-label text-purple-8">
            <q-icon name="account_balance" /> Transferencia
          </div>
          <div class="stat-amount">{{ formatCurrency(stats.transferencia) }}</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="mini-stat-card">
          <div class="stat-label text-teal-8">
            <q-icon name="local_atm" /> Dólares
          </div>
          <div class="stat-amount">USD {{ formatNumber(stats.usd) }}</div>
        </div>
      </div>
    </div>

    <!-- Sales List -->
    <div class="sales-section">
      <h2 class="text-h5 text-weight-bold q-mb-md text-grey-8">Movimientos del Día</h2>

      <div v-if="loading" class="row justify-center q-py-lg">
        <q-spinner-dots size="3rem" color="primary" />
      </div>

      <div v-else-if="ventasHoy.length === 0" class="empty-state text-center q-py-xl">
        <q-icon name="point_of_sale" size="4rem" color="grey-4" />
        <p class="text-grey-5 q-mt-md text-h6">No se han registrado ventas hoy.</p>
      </div>

      <q-list v-else separator class="sales-list bg-white shadow-1 rounded-borders">
        <q-expansion-item v-for="venta in ventasHoy" :key="venta.id" group="sales" class="sale-item"
          expand-icon-class="hidden">
          <template v-slot:header="{ expanded }">
            <div class="row full-width items-center q-py-xs">
              <div class="col-auto q-mr-md">
                <div class="time-badge">{{ formatTime(venta.fecha_venta) }}</div>
              </div>
              <div class="col">
                <div class="text-weight-bold text-grey-9">{{ venta.cliente || 'Cliente General' }}</div>
                <div class="text-caption text-grey-6">
                  <q-icon name="payments" size="xs" /> {{ venta.metodo_pago }}
                  <span v-if="venta.comentarios" class="q-ml-sm text-italic">"{{ venta.comentarios }}"</span>
                </div>
              </div>
              <div class="col-auto text-right row items-center q-gutter-x-sm">
                <q-btn icon="print" flat round dense color="primary" @click.stop="printVenta(venta)">
                  <q-tooltip>Imprimir esta venta</q-tooltip>
                </q-btn>
                <div>
                  <div class="text-weight-bolder text-primary text-body1">{{ formatCurrency(venta.total) }}</div>
                  <div class="text-caption text-grey-5">#{{ venta.id }}</div>
                </div>
                <!-- Manual Arrow Icon -->
                <q-icon :name="expanded ? 'expand_less' : 'expand_more'" size="sm" color="grey-6" />
              </div>
            </div>
          </template>

          <q-card>
            <q-card-section class="bg-grey-1 q-px-md q-py-sm">
              <div class="text-caption text-weight-bold text-grey-7 q-mb-xs">PRODUCTOS VENDIDOS:</div>
              <div v-for="detalle in venta.detallesVenta" :key="detalle.id"
                class="row justify-between q-mb-xs text-body2">
                <div>
                  <span class="text-weight-bold">{{ detalle.cantidad }}</span>
                  <span v-if="detalle.medida"> {{ detalle.medida }}</span> x {{
                    getProductoNombre(detalle.producto_id) }}
                </div>
                <div class="text-grey-7">
                  {{ formatCurrency((detalle.precio_unitario || 0) * (detalle.cantidad || 0)) }}
                </div>
              </div>
            </q-card-section>
          </q-card>
        </q-expansion-item>
      </q-list>
    </div>

    <!-- Receipt Printer Component (hidden, only for printing) -->
    <ReceiptPrinter ref="receiptPrinter" :data="lastReceipt" />
  </q-page>
</template>

<style scoped>
.corte-page {
  background-color: #f8fafc;
  min-height: 100vh;
}

/* Premium Gradient Utilities */
.gradient-bg {
  background: linear-gradient(135deg, #FFD54F 0%, #8B5E3C 100%);
}

.text-primary {
  color: #8B5E3C !important;
}

.border-gradient {
  position: relative;
  overflow: hidden;
}

.border-gradient::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: linear-gradient(to bottom, #FFD54F, #8B5E3C);
}

/* KPI Cards */
.kpi-card {
  padding: 1.5rem;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  gap: 1.5rem;
  height: 100%;
  transition: transform 0.2s;
}

.kpi-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08);
}

.kpi-icon {
  padding: 10px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.border-gradient .kpi-icon {
  background: #fff3e0;
}

.kpi-content {
  flex: 1;
}

.kpi-label {
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.25rem;
  opacity: 0.9;
}

.kpi-value {
  font-size: 1.75rem;
  font-weight: 800;
  line-height: 1.2;
}

/* Sales List */
.sales-list {
  border-radius: 16px;
  overflow: hidden;
}

.sale-item:hover {
  background-color: #fcfcfc;
}

.time-badge {
  background: #f1f5f9;
  color: #64748b;
  font-weight: 600;
  font-size: 0.75rem;
  padding: 4px 8px;
  border-radius: 6px;
}

.mini-stat-card {
  background: white;
  padding: 1rem;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
  text-align: center;
  border: 1px solid #f0f0f0;
  transition: all 0.2s;
}

.mini-stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.06);
  border-color: #e0e0e0;
}

.stat-label {
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.stat-amount {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1e293b;
}

.hidden {
  display: none !important;
}
</style>
