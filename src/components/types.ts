export interface ReceiptProduct {
  cantidad: number;
  medida: string;
  nombre: string;
  precio_unitario: number;
}

export interface PaymentBreakdown {
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  dolares: number;
  tasaCambio: number;
  totalPagado: number;
}

export interface ReceiptData {
  cliente: string;
  productos: ReceiptProduct[];
  total: number;
  metodoPago: string;
  fecha: string;
  comentarios?: string;
  cambio?: number;
  ahorroTapicero?: number;
  pagoDetalle?: PaymentBreakdown;
}
