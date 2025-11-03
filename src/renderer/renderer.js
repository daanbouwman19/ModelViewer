import { createApp } from 'vue';
import App from './App.vue';
import './assets/main.css';

const app = createApp(App);

// Add global error handler
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error]', err, info);
};

app.mount('#app');
