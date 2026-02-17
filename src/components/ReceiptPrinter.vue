<script setup lang="ts">
import type { ReceiptData } from './types'
import logoImg from '/icons/96x96.png?url'

const props = defineProps<{
  data: ReceiptData | null
}>()

const storeInfo = {
  name: 'TELAS EMANUEL',
  address: 'AV. JOSÉ LÓPEZ PORTILLO MZA 101 LT 11 SM 94, CANCÚN, Q. ROO',
  phone: 'Teléfono: (998) 702 2579'
}

const generateReceiptHTML = (data: ReceiptData) => {
  console.log('🎟️ Generando recibo con datos:', data)
  console.log('📦 Productos en el recibo:', data.productos)
  
  const products = data.productos.map(p => `
    <tr>
      <td colspan="3"><b>${p.nombre}</b></td>
    </tr>
    <tr>
      <td>${p.cantidad} ${p.medida}</td>
      <td>@ $${p.precio_unitario.toFixed(2)}</td>
      <td style="text-align:right"><b>$${(p.precio_unitario * p.cantidad).toFixed(2)}</b></td>
    </tr>
  `).join("")

  return `
  <html>
    <head>
      <style>
        @page {
          size: 80mm auto;
          margin: 0;
        }

        body {
          font-family: monospace;
          font-size: 12px;
          width: 80mm;
          margin: 0;
          padding: 0;
        }

        .center { text-align: center; }
        .line { border-top: 1px dashed black; margin: 6px 0; }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        td {
          padding: 2px 0;
        }

        .total {
          font-size: 14px;
          font-weight: bold;
        }
      </style>
    </head>

    <body>
      <div class="center">
        <img src="${logoImg}" width="60" />
        <h3>${storeInfo.name}</h3>
        <div>${storeInfo.address}</div>
        <div>${storeInfo.phone}</div>
      </div>

      <div class="line"></div>

      <div>FECHA: ${data.fecha}</div>
      <div>CLIENTE: ${data.cliente}</div>
      <div>PAGO: ${data.metodoPago}</div>

      <div class="line"></div>

      <table>
        ${products}
      </table>

      <div class="line"></div>

      <div class="total">
        TOTAL: $${data.total.toFixed(2)}
      </div>

      ${data.cambio ? `<div>Cambio: $${data.cambio.toFixed(2)}</div>` : ""}

      <div class="line"></div>
      <div class="center"><b>¡Gracias por su compra!</b></div>

      <br><br><br>
    </body>
  </html>
  `
}

const printReceiptWindow = async () => {
  if (!props.data) return
  
  const html = generateReceiptHTML(props.data)
  
  try {
    // Detectar si estamos en Electron o navegador
    const isElectron = typeof window !== 'undefined' && (window.electron !== undefined || window.pos?.printTicket !== undefined)
    
    if (isElectron && window.pos?.printTicket) {
      // Estamos en Electron - usar API nativa
      await window.pos.printTicket(html)
      console.log('✅ Ticket enviado a impresora (Electron)')
    } else {
      // Estamos en navegador - imprimir en ventana nueva
      console.log('📄 Imprimiendo en navegador (fallback)')
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        printWindow.document.write(html)
        printWindow.document.close()
        printWindow.print()
        console.log('✅ Ventana de impresión abierta')
      }
    }
  } catch (error) {
    console.error('❌ Error imprimiendo:', error)
    // Fallback a ventana si falla
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      const generatedHtml = props.data ? generateReceiptHTML(props.data) : ''
      printWindow.document.write(generatedHtml)
      printWindow.document.close()
      printWindow.print()
    }
  }
}

defineExpose({
  getHTML: () => props.data ? generateReceiptHTML(props.data) : null,
  print: printReceiptWindow
})
</script>

<template>
  <div style="display:none"></div>
</template>
