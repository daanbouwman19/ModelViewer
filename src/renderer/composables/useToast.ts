import { ref } from 'vue';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

const toasts = ref<Toast[]>([]);

export function useToast() {
  const add = (
    message: string,
    type: Toast['type'] = 'info',
    duration = 3000,
  ) => {
    const id =
      Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    const toast: Toast = { id, message, type };
    toasts.value.push(toast);

    if (duration > 0) {
      setTimeout(() => {
        remove(id);
      }, duration);
    }
  };

  const remove = (id: string) => {
    const index = toasts.value.findIndex((t) => t.id === id);
    if (index !== -1) {
      toasts.value.splice(index, 1);
    }
  };

  return {
    toasts,
    add,
    remove,
    success: (msg: string, duration?: number) => add(msg, 'success', duration),
    error: (msg: string, duration?: number) => add(msg, 'error', duration),
    info: (msg: string, duration?: number) => add(msg, 'info', duration),
  };
}
