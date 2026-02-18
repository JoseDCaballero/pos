<script setup lang="ts">
import type { ReceiptData } from './types'
import logoImg from 'src/assets/logo_negro.jpeg?url'

const props = defineProps<{
  data: ReceiptData | null
}>()

const storeInfo = {
  name: 'TELAS EMANUEL',
  address: 'AV. JOSÉ LÓPEZ PORTILLO MZA 101 LT 11 SM 94, CANCÚN, Q. ROO',
  phone: 'Teléfono: (998) 702 2579'
}

const formatReceiptDate = (rawDate: string) => {
  const date = new Date(rawDate)
  if (Number.isNaN(date.getTime())) return rawDate

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
}

const toMoney = (value: number) => `$${Number(value || 0).toFixed(2)}`

const escapeHTML = (text: string) => text
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const formatCommentsHTML = (comments?: string) => {
  const text = (comments ?? '')
    .replace(/^\[Detalle Pago:[^\]]*\]\s*/i, '')
    .trim()

  if (!text) return ''

  const escaped = escapeHTML(text)
    .replaceAll('\n', '<br/>')

  return `<div><b>Comentarios:</b></div><div>${escaped}</div>`
}

const paymentLinesHTML = (data: ReceiptData) => {
  const detail = data.pagoDetalle

  if (!detail) {
    return `<div>Pagó con: ${toMoney(data.total + (data.cambio ?? 0))}</div>`
  }

  if (data.metodoPago === 'TARJETA') {
    const amount = detail.tarjeta > 0 ? detail.tarjeta : detail.totalPagado
    return `<div>Pago con tarjeta: ${toMoney(amount)}</div>`
  }

  if (data.metodoPago === 'TRANSFERENCIA') {
    const amount = detail.transferencia > 0 ? detail.transferencia : detail.totalPagado
    return `<div>Pago con transferencia: ${toMoney(amount)}</div>`
  }

  if (data.metodoPago === 'MIXTO') {
    const lines: string[] = ['<div><b>Desglose de pago:</b></div>']

    if (detail.efectivo > 0) lines.push(`<div>Efectivo: ${toMoney(detail.efectivo)}</div>`)
    if (detail.tarjeta > 0) lines.push(`<div>Tarjeta: ${toMoney(detail.tarjeta)}</div>`)
    if (detail.transferencia > 0) lines.push(`<div>Transferencia: ${toMoney(detail.transferencia)}</div>`)
    if (detail.dolares > 0) {
      lines.push(`<div>Dólares: ${toMoney(detail.dolares * detail.tasaCambio)} (${detail.dolares.toFixed(2)} USD)</div>`)
    }

    return lines.join('')
  }

  const efectivo = detail.efectivo + (detail.dolares * detail.tasaCambio)
  return `<div>Efectivo: ${toMoney(efectivo > 0 ? efectivo : detail.totalPagado)}</div>`
}

const resolveLogoForPrint = async () => {
  try {
    const image = new Image()
    image.decoding = 'sync'

    const dataUrl = await new Promise<string>((resolve, reject) => {
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const width = image.naturalWidth
          const height = image.naturalHeight

          canvas.width = width
          canvas.height = height

          const ctx = canvas.getContext('2d')
          if (!ctx) return resolve(logoImg)

          ctx.drawImage(image, 0, 0)

          const imgData = ctx.getImageData(0, 0, width, height)
          const data: Uint8ClampedArray = imgData.data

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i]!
            const g = data[i + 1]!
            const b = data[i + 2]!

            const gray = 0.3 * r + 0.59 * g + 0.11 * b
            const value = gray > 180 ? 255 : 0

            data[i] = value
            data[i + 1] = value
            data[i + 2] = value
          }

          ctx.putImageData(imgData, 0, 0)

          resolve(canvas.toDataURL('image/png'))
        } catch (error) {
          reject(error instanceof Error ? error : new Error('No se pudo procesar el logo para impresión'))
        }
      }

      image.onerror = () => reject(new Error('No se pudo cargar el logo'))
      image.src = logoImg
    })

    return dataUrl
  } catch {
    return logoImg
  }
}

const generateReceiptHTML = (data: ReceiptData, logoSrc: string = logoImg) => {
  const products = data.productos.map(p => `
    <tr class="product-main">
      <td><b>${escapeHTML(p.nombre)}</b></td>
      <td class="col-right">${toMoney(p.precio_unitario)}</td>
      <td class="col-right"><b>${toMoney(p.precio_unitario * p.cantidad)}</b></td>
    </tr>
    <tr class="qty-row">
      <td>Cant: ${Number(p.cantidad)} ${escapeHTML(p.medida ?? '')}</td>
      <td></td>
      <td></td>
    </tr>
  `).join('')

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
          font-size: 12px;
          max-width: 58mm;
          overflow: hidden;
        }

        .center { text-align: center; }
        .line { border-top: 1px dashed black; margin: 6px 0; }

        table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }

        col.col-producto {
          width: 52%;
        }

        col.col-pu {
          width: 22%;
        }

        col.col-pt {
          width: 26%;
        }

        th {
          text-align: left;
          font-weight: bold;
          font-size: 11px;
          border-bottom: 1px dashed black;
          padding: 2px 0;
        }

        td {
          padding: 2px 0;
          vertical-align: top;
          font-size: 11px;
        }

        .col-right {
          text-align: right;
          white-space: nowrap;
          padding-left: 4px;
        }

        .product-main td:first-child {
          word-break: break-word;
          padding-right: 4px;
        }

        .qty-row td {
          font-size: 11px;
          padding-top: 0;
          padding-bottom: 4px;
        }

        h3 {
          margin: 4px 0;
        }

        .total {
          font-size: 14px;
          font-weight: bold;
        }
      </style>
    </head>

    <body>
      <div class="center">
        <img src="${logoSrc}" width="56" />
        <h3>${storeInfo.name}</h3>
        <div>${storeInfo.address}</div>
        <div>${storeInfo.phone}</div>
      </div>

      <div class="line"></div>

      <div>FECHA: ${formatReceiptDate(data.fecha)}</div>
      <div>CLIENTE: ${data.cliente}</div>
      <div>PAGO: ${data.metodoPago}</div>

      <div class="line"></div>

      <table>
        <colgroup>
          <col class="col-producto" />
          <col class="col-pu" />
          <col class="col-pt" />
        </colgroup>
        <thead>
          <tr>
            <th>Productos</th>
            <th class="col-right">P.U.</th>
            <th class="col-right">P.T.</th>
          </tr>
        </thead>
        <tbody>
          ${products}
        </tbody>
      </table>

      <div class="line"></div>

      <div class="total">TOTAL: ${toMoney(data.total)}</div>
      ${data.ahorroTapicero && data.ahorroTapicero > 0 ? `<div><b>Usted se ahorró: ${toMoney(data.ahorroTapicero)}</b></div>` : ''}
      ${paymentLinesHTML(data)}
      ${data.cambio ? `<div>Cambio: ${toMoney(data.cambio)}</div>` : `<div>Cambio: 0.00</div>`}
      ${formatCommentsHTML(data.comentarios)}

      <div class="line"></div>
      <div class="center"><b>¡Gracias por su compra!</b></div>

      <br><br><br>
    </body>
  </html>
  `
}

const printReceiptWindow = async () => {
  if (!props.data) return

  const printLogo = await resolveLogoForPrint()

  const html = generateReceiptHTML(props.data, printLogo)

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
