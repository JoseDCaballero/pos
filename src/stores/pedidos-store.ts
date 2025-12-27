import { defineStore } from "pinia";
import { ref } from "vue";
import api from "src/api/axios";

export interface ProductoPedido {
  productoId: number;
  nombre: string;
  cantidad: number | string;
  medida: string;
}

export interface DetallePedidoBackend {
  id: number;
  pedidoId: number;
  productoId: number;
  nombre: string;
  cantidad: number | string;
  medida: string;
}

export interface PedidoBackend {
  id: number;
  comprador: string;
  DetallePedido?: DetallePedidoBackend[];
  estado: "pendiente" | "completado" | "cancelado";
  fecha: string;
  total?: number;
  comentarios?: string | null;
}

export interface Pedido {
  id?: number;
  comprador: string;
  productos: ProductoPedido[];
  estado: "pendiente" | "completado" | "cancelado";
  fecha: string;
  total?: number;
  comentarios?: string | null;
}

// Función helper para transformar pedidos del backend
const transformarPedidoBackend = (pedidoBackend: PedidoBackend): Pedido => {
  const productos: ProductoPedido[] = pedidoBackend.DetallePedido
    ? pedidoBackend.DetallePedido.map((detalle) => ({
        productoId: detalle.productoId,
        nombre: detalle.nombre,
        cantidad:
          typeof detalle.cantidad === "string" ? parseFloat(detalle.cantidad) : detalle.cantidad,
        medida: detalle.medida,
      }))
    : [];

  return {
    id: pedidoBackend.id,
    comprador: pedidoBackend.comprador,
    productos,
    estado: pedidoBackend.estado,
    fecha: pedidoBackend.fecha,
    ...(pedidoBackend.total !== undefined ? { total: pedidoBackend.total } : {}),
    ...(pedidoBackend.comentarios !== undefined
      ? { comentarios: pedidoBackend.comentarios }
      : {}),
  };
};

export const usePedidosStore = defineStore("pedidos", () => {
  const pedidos = ref<Pedido[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const agregarPedido = async (pedido: Omit<Pedido, "id" | "fecha">) => {
    loading.value = true;
    error.value = null;
    try {
      const response = await api.post("pedidos", {
        ...pedido,
        fecha: new Date().toISOString(),
      });
      pedidos.value.push(response.data);
      return response.data;
    } catch (err) {
      error.value = "Error al crear el pedido";
      console.error("Error agregando pedido:", err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const obtenerPedidos = async () => {
    loading.value = true;
    error.value = null;
    try {
      const response = await api.get("pedidos");
      // Transformar los pedidos del backend al formato del frontend
      pedidos.value = response.data.map((pedidoBackend: PedidoBackend) =>
        transformarPedidoBackend(pedidoBackend),
      );
    } catch (err) {
      error.value = "Error al obtener pedidos";
      console.error("Error obteniendo pedidos:", err);
    } finally {
      loading.value = false;
    }
  };

  const actualizarEstadoPedido = async (id: number, estado: Pedido["estado"]) => {
    loading.value = true;
    error.value = null;
    try {
      const response = await api.put(`pedidos/status/${id}`, { estado });
      const index = pedidos.value.findIndex((p) => p.id === id);
      if (index !== -1) {
        // Transformar la respuesta del backend
        pedidos.value[index] = transformarPedidoBackend(response.data);
      }
    } catch (err) {
      error.value = "Error al actualizar pedido";
      console.error("Error actualizando pedido:", err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const agregarPedidoLocal = (pedido: Pedido | PedidoBackend) => {
    // Si el pedido tiene DetallePedido, es del backend y necesita transformación
    if ("DetallePedido" in pedido) {
      const pedidoTransformado = transformarPedidoBackend(pedido);
      pedidos.value.push(pedidoTransformado);
    } else {
      pedidos.value.push(pedido as Pedido);
    }
  };

  return {
    pedidos,
    loading,
    error,
    agregarPedido,
    obtenerPedidos,
    actualizarEstadoPedido,
    agregarPedidoLocal,
  };
});
