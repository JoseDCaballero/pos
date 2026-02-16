<script setup lang="ts">
import printJS from 'print-js';
import type { ReceiptData } from './types';
import logoImg from '/public/icons/96x96.png?url';

const props = defineProps<{
  data: ReceiptData | null;
}>();

const emit = defineEmits<{
  (e: 'printed'): void;
}>();

// Store info - these can be customized later
const storeInfo = {
  name: 'TELAS EMANUEL',
  address: 'AV. JOSÉ LÓPEZ PORTILLO MZA 101 LT 11 SM 94, CANCÚN, Q. ROO',
  phone: 'Teléfono: (998) 702 2579',
};

const print = () => {
  if (!props.data) return;

  const receiptHTML = generateReceiptHTML(props.data);

  printJS({
    printable: receiptHTML,
    type: 'raw-html',
    style: `
      @media print {
        body { margin: 0; padding: 0; }
        .receipt {
          font-family: 'Courier New', monospace;
          width: 80mm;
          font-size: 12px;
          line-height: 1.4;
        }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .separator { border-top: 1px dashed #000; margin: 8px 0; }
        .row { display: flex; justify-content: space-between; margin: 4px 0; }
        .total-row { font-size: 14px; font-weight: bold; margin-top: 8px; }
        .header { font-size: 16px; font-weight: bold; margin-bottom: 4px; }
        .logo { margin-bottom: 10px; }
        .logo img { width: 60px; height: 60px; }
      }
    `,
    onPrintDialogClose: () => {
      emit('printed');
    }
  });
};

const generateReceiptHTML = (data: ReceiptData): string => {
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('es-MX', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const productsHTML = data.productos.map(p => `
    <div class="row">
      <div>${p.cantidad} ${p.medida} x ${p.nombre}</div>
    </div>
    <div class="row">
      <div></div>
      <div>$${(p.precio_unitario * p.cantidad).toFixed(2)}</div>
    </div>
  `).join('');

  return `
    <div class="receipt">
      <div class="center logo">
        <img src="${logoImg}" alt="Logo">
      </div>
      <div class="center header">${storeInfo.name}</div>
      <div class="center">${storeInfo.address}</div>
      <div class="center">${storeInfo.phone}</div>
      <div class="separator"></div>

      <div class="row">
        <div>FECHA:</div>
        <div>${formatDate(data.fecha)}</div>
      </div>
      <div class="row">
        <div>CLIENTE:</div>
        <div>${data.cliente.toUpperCase()}</div>
      </div>
      <div class="row">
        <div>MÉTODO DE PAGO:</div>
        <div>${data.metodoPago}</div>
      </div>

      <div class="separator"></div>
      <div class="bold">PRODUCTOS:</div>
      ${productsHTML}

      <div class="separator"></div>
      <div class="row total-row">
        <div>TOTAL:</div>
        <div>$${data.total.toFixed(2)}</div>
      </div>

      ${data.cambio ? `
        <div class="row">
          <div>Cambio:</div>
          <div>$${data.cambio.toFixed(2)}</div>
        </div>
      ` : ''}

      ${data.comentarios ? `
        <div class="separator"></div>
        <div style="font-size: 10px;">Notas: ${data.comentarios}</div>
      ` : ''}

      <div class="separator"></div>
      <div class="center bold">¡Gracias por su compra!</div>
      <div class="separator"></div>
    </div>
  `;
};

// Expose print method to parent
defineExpose({ print });
</script>

<template>
  <!-- This component doesn't render anything visible, it's just for printing -->
  <div style="display: none;"></div>
</template>
