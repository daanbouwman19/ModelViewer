/**
 * @file Entry point for the Vue renderer process.
 * Initializes the Vue application, sets up global error handling, and mounts the root component.
 */
import { createApp } from 'vue';
// @ts-expect-error vue-virtual-scroller missing types
import VueVirtualScroller from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import App from './App.vue';
import './assets/main.css';

const app = createApp(App);

app.use(VueVirtualScroller);

// Add global error handler
app.config.errorHandler = (err, _instance, info) => {
  console.error('[Vue Error]', err, info);
};

app.mount('#app');
