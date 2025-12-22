import type { RouteRecordRaw } from 'vue-router';
import MainLayout from 'layouts/MainLayout.vue';
import DefaultLayout from 'layouts/DefaultLayout.vue';
import { HomePage, CatsBodPage, CatsTiePage, ProdsBodPage, ProdsTiePage, LoginPage, PedidosPage, CarritoPage } from '../pages/index';

const routes: RouteRecordRaw[] = [
  // {
  //   path: '/',
  //   component: () => import('layouts/MainLayout.vue'),
  //   children: [{ path: '', component: () => import('pages/IndexPage.vue') }],
  // },
  {
    path: '/',
    component: LoginPage,
    meta: {
      title: 'Inicia sesión',
      layout: DefaultLayout
    }
  },
  {
    path: '/select',
    component: HomePage,
    meta: {
      title: 'Inicio',
      layout: MainLayout
    }
  },
  {
    path: '/bodega',
    component: CatsBodPage,
    meta: {
      title: 'Inventario de bodega',
      layout: MainLayout
    }
  },
  {
    path: '/existencias-bodega/:categoryId',
    name: 'ConfiguracionPorCategoria',
    component: ProdsBodPage,
    props: true,
    meta: {
      title: 'Inventario de bodega',
      layout: MainLayout
    }
  },
  {
    path: '/tienda',
    component: CatsTiePage,
    meta: {
      title: 'Inventario de tienda',
      layout: MainLayout
    }
  },
  {
    path: '/existencias-tienda/:categoryId',
    name: 'ConfiguracionPorCategoriaTienda',
    component: ProdsTiePage,
    props: true,
    meta: {
      title: 'Inventario de tienda',
      layout: MainLayout
    }
  },
  {
    path: '/caja',
    component: PedidosPage,
    meta: {
      title: 'Pedidos activos',
      layout: MainLayout
    }
  },
  {
    path: '/carrito',
    component: CarritoPage,
    meta: {
      title: 'Carrito de Compras',
      layout: MainLayout
    }
  },
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
];

export default routes;
