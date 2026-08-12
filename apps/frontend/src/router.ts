import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth';
import Home from './views/Home.vue';
import Login from './views/Login.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/setup-password',
      name: 'setup-password',
      component: () => import('./views/SetupPassword.vue'),
      meta: { public: true }
    },
    {
      path: '/login',
      name: 'login',
      component: Login,
      meta: { public: true }
    },
    {
      path: '/',
      name: 'home',
      component: Home,
      meta: { public: false }
    },
    {
      path: '/callback',
      name: 'callback',
      component: Login,
      meta: { public: true }
    }
  ]
});

router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore();
  
  if (!authStore.isAuthenticated && !to.meta.public) {
    return next('/login');
  }
  
  if (authStore.isAuthenticated && to.name === 'login') {
    return next('/');
  }
  
  next();
});

export default router;
