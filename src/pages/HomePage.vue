<template>
  <div class="select-page">
    <!--<nav class="breadcrumb">
            <span class="breadcrumb-current">Inicio</span>
        </nav>-->
    <header>
      <h1>Selecciona una opción</h1>
      <p class="subtitle">Elige el inventario que deseas ver</p>
    </header>
    <section class="actions">
      <router-link to="/tienda" class="card">
        <span class="icon">📋</span>
        <h3>Tienda</h3>
        <p>Estas son las existencias de la tienda</p>
      </router-link>
      <router-link to="/bodega" class="card">
        <span class="icon">📦</span>
        <h3>Bodega</h3>
        <p>Estas son las existencias de la bodega</p>
      </router-link>
    </section>
  </div>
</template>

<style scoped>
* {
  box-sizing: border-box;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 2rem;
  font-size: 0.95rem;
}

.breadcrumb-item {
  color: #007bff;
  text-decoration: none;
  transition: color 0.2s;
}

.breadcrumb-item:hover {
  color: #0056b3;
  text-decoration: underline;
}

.breadcrumb-separator {
  color: #6c757d;
}

.breadcrumb-current {
  color: #495057;
  font-weight: 500;
}

.select-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  font-family: 'Segoe UI', Arial, sans-serif;
  padding: 1rem;
}

header {
  text-align: center;
  margin-bottom: 2rem;
  margin-top: 1rem;
}

header h1 {
  font-size: 3rem;
  font-weight: 700;
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.subtitle {
  font-size: 1.2rem;
  color: #7f8c8d;
  margin-top: 0;
}

.actions {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: flex-start;
  gap: 1.5rem;
  flex-wrap: wrap;
  width: 100%;
  margin: 0 auto;
  padding: 0 0.5rem;
}

.card {
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
  padding: 2rem 1.5rem;
  flex: 1 1 300px;
  max-width: 360px;
  text-align: center;
  transition: all 0.3s ease;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.card:hover {
  transform: translateY(-10px);
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.18);
}

.icon {
  font-size: 4rem;
  margin-bottom: 1.5rem;
  display: block;
}

.card h3 {
  font-size: 1.8rem;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 1rem;
}

.card p {
  font-size: 1rem;
  color: #7f8c8d;
  line-height: 1.6;
}

@media (max-width: 750px) {
  header h1 {
    font-size: 1.8rem;
  }

  .subtitle {
    font-size: 1rem;
  }

  .actions {
    flex-direction: column;
    gap: 1rem;
    padding: 0;
  }

  .card {
    flex: 1 1 auto;
    width: 100%;
    max-width: none;
    padding: 1.5rem 1.25rem;
  }

  .icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .card h3 {
    font-size: 1.4rem;
    margin-bottom: 0.75rem;
  }

  .card p {
    font-size: 0.9rem;
  }
}
</style>
