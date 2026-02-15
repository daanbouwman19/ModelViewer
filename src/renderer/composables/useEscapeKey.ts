import { onMounted, onUnmounted, type Ref } from 'vue';

export function useEscapeKey(isOpen: Ref<boolean>, callback: () => void) {
  const handleKeydown = (e: KeyboardEvent) => {
    if (isOpen.value && e.key === 'Escape') {
      callback();
    }
  };

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
}
