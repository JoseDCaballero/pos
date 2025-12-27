import { boot } from "quasar/wrappers";
import { io } from "socket.io-client";

const socket = io(import.meta.env.VITE_API_SOCKET, {
  transports: ["websocket"], // <--- ¡ESTO ES VITAL EN RENDER!
  autoConnect: true,
});

socket.on("connect", () => {
  console.log("Conectado al servidor de sockets con ID:", socket.id);
});

socket.on("connect_error", (err) => {
  console.error("Error de conexión al socket:", err);
});

socket.on("disconnect", (reason) => {
  console.warn("Socket desconectado:", reason);
});

export default boot(({ app }) => {
  app.config.globalProperties.$socket = socket;
});

export { socket };
