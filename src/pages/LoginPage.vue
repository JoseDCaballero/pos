<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import axios, { type AxiosError } from 'axios';

const router = useRouter()
const username = ref('')
const password = ref('')
const mensajeError = ref('')
const isPwd = ref(true)
const datos = ref<{ email?: string } | null>(null);

const login = async () => {
  mensajeError.value = ''
  //await router.push('/select');
  try {
    const response = await axios.post(import.meta.env.VITE_API + 'usuarios/login', {
      email: username.value,
      passw: password.value
    });
    // 1. Extraer el token de la respuesta
    const token = response.data.token;

    if (token) {
      // 2. Guardar en sessionStorage
      sessionStorage.setItem('auth_token', token);

      // Opcional: Guardar datos del usuario (como string JSON)
      sessionStorage.setItem('user_data', JSON.stringify(response.data.usuario));

      const datosString = sessionStorage.getItem('user_data');
      if (datosString) {
        datos.value = JSON.parse(datosString);
      }
      // 3. Redirigir
      switch (datos.value?.email) {
        case 'caja':
          await router.push('/carrito');
          break;
        case 'vendedor':
          await router.push('/select');
          break;
      }
    }

  } catch (error) {
    const err = error as AxiosError; // Casteamos el error
    console.error('Error durante el inicio de sesión:', err);

    if (err.response && err.response.status === 401) {
      mensajeError.value = 'Credenciales inválidas. Revisa tu usuario y contraseña.';
    } else {
      mensajeError.value = 'Hubo un problema al conectar con el servidor.';
    }
  }
}
</script>

<template>
  <main>
    <form @submit.prevent="login">
      <h1>Inicio de sesión</h1>
      <div class="input-group">
        <label for="username">Usuario:</label>
        <input type="text" id="username" v-model="username" required />
      </div>
      <div class="input-group password-group">
        <label for="password">Contraseña:</label>
        <input :type="isPwd ? 'password' : 'text'" id="password" v-model="password" required />
        <span @click="isPwd = !isPwd" class="toggle-password" :title="isPwd ? 'Mostrar contraseña' : 'Ocultar contraseña'">
          <svg v-if="isPwd" class="eye-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="#8B4513" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="12" cy="12" r="3" stroke="#8B4513" stroke-width="2"/>
          </svg>
          <svg v-else class="eye-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.99902 3L20.999 21M9.8433 9.91364C9.32066 10.4536 8.99902 11.1892 8.99902 12C8.99902 13.6569 10.3422 15 11.999 15C12.8215 15 13.5667 14.669 14.1086 14.133M6.49902 6.64715C4.59972 7.90034 3.15305 9.78394 2.45703 12C3.73128 16.0571 7.52159 19 11.9992 19C13.9881 19 15.8414 18.4194 17.3988 17.4184M10.999 5.04939C11.328 5.01673 11.6617 5 11.9992 5C16.4769 5 20.2672 7.94291 21.5414 12C21.2607 12.894 20.8577 13.7338 20.3522 14.5" stroke="#8B4513" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </div>
      <button type="submit">Iniciar Sesión</button>
      <p v-if="mensajeError" class="error-message">{{ mensajeError }}</p>
    </form>
  </main>
</template>

<style scoped>
main {
  min-height: 100vh;
  background: linear-gradient(135deg, #FFFFFF 0%, #FFD700 100%);
  background-attachment: fixed;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Poppins', sans-serif;
  overflow: hidden;
}

main::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at 20% 80%, rgba(139, 69, 19, 0.1) 0%, transparent 50%),
              radial-gradient(circle at 80% 20%, rgba(255, 215, 0, 0.1) 0%, transparent 50%);
  animation: float 10s ease-in-out infinite alternate;
}

@keyframes float {
  0% { transform: translateY(0px) rotate(0deg); }
  100% { transform: translateY(-20px) rotate(5deg); }
}

form {
  max-width: 450px;
  width: 100%;
  margin: 2rem;
  padding: 3rem;
  border: none;
  border-radius: 20px;
  background: rgba(139, 69, 19, 0.15);
  backdrop-filter: blur(20px);
  box-shadow: 0 20px 40px rgba(139, 69, 19, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
  position: relative;
  z-index: 1;
  animation: slideIn 1s ease-out;
  transform: perspective(1000px) rotateX(5deg);
  transition: transform 0.3s ease;
}

form:hover {
  transform: perspective(1000px) rotateX(0deg);
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(50px) perspective(1000px) rotateX(10deg); }
  to { opacity: 1; transform: translateY(0) perspective(1000px) rotateX(5deg); }
}

h1 {
  text-align: center;
  color: #8B4513;
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 2rem;
  text-shadow: 0 5px 15px rgba(139, 69, 19, 0.5);
  background: linear-gradient(45deg, #FFD700, #8B4513);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.input-group {
  margin-bottom: 2rem;
  position: relative;
}

label {
  display: block;
  color: #8B4513;
  font-weight: 600;
  margin-bottom: 0.5rem;
  font-size: 1.1rem;
  text-shadow: 0 2px 5px rgba(139, 69, 19, 0.3);
}

input {
  width: 100%;
  padding: 1rem 3rem 1rem 1.5rem; /* Espacio extra a la derecha para el ícono */
  border: none;
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.8);
  color: #8B4513;
  font-size: 1rem;
  font-weight: 400;
  box-shadow: inset 0 5px 10px rgba(139, 69, 19, 0.2);
  transition: all 0.3s ease;
  outline: none;
}

input::placeholder {
  color: rgba(139, 69, 19, 0.7);
}

input:focus {
  background: rgba(255, 255, 255, 0.9);
  box-shadow: inset 0 5px 10px rgba(139, 69, 19, 0.3), 0 0 20px rgba(255, 215, 0, 0.5);
  transform: scale(1.02);
}

.password-group .toggle-password {
  position: absolute;
  right: 15px;
  top: 50%;
  transform: translateY(-50%);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
  box-shadow: 0 2px 5px rgba(139, 69, 19, 0.2);
}

.password-group .toggle-password:hover {
  background: rgba(255, 215, 0, 0.2);
  transform: translateY(-50%) scale(1.1);
  box-shadow: 0 4px 10px rgba(139, 69, 19, 0.4);
}

.eye-icon {
  width: 20px;
  height: 20px;
  transition: all 0.3s ease;
}

.eye-icon:hover {
  stroke: #FFD700; /* Cambia a amarillo en hover */
}

button {
  width: 100%;
  padding: 1.2rem;
  border: none;
  border-radius: 15px;
  background: linear-gradient(45deg, #FFD700, #8B4513);
  color: #FFFFFF;
  font-size: 1.2rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 10px 20px rgba(139, 69, 19, 0.3);
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  transition: left 0.5s ease;
}

button:hover::before {
  left: 100%;
}

button:hover {
  transform: translateY(-5px);
  box-shadow: 0 15px 30px rgba(139, 69, 19, 0.4);
}

button:active {
  transform: translateY(-2px);
}

.error-message {
  text-align: center;
  color: #FFD700;
  font-weight: 500;
  margin-top: 1rem;
  text-shadow: 0 2px 5px rgba(139, 69, 19, 0.5);
  animation: shake 0.5s ease;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}

@media (max-width: 600px) {
  form {
    padding: 2rem;
    margin: 1rem;
  }
  h1 {
    font-size: 2rem;
  }
}
</style>
