import { boot } from 'quasar/wrappers'
import { io } from 'socket.io-client'
// Tu URL de Render (ejemplo: https://mi-api-pos.onrender.com)
const socket = io('https://apinventario.onrender.com', {
  transports: ['websocket'], // <--- ¡ESTO ES VITAL EN RENDER!
  autoConnect: true
})

socket.on('connect', () => {
  console.log('Conectado al servidor de sockets con ID:', socket.id)
});

export default boot(({ app }) => {
  app.config.globalProperties.$socket = socket
})

export { socket }
