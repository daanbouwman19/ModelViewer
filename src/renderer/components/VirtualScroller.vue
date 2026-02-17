<template>
  <div
    ref="scroller"
    class="h-full overflow-y-auto relative w-full custom-scrollbar"
    @scroll.passive="handleScroll"
  >
    <!-- Spacer to force scrollbar -->
    <div :style="{ height: totalHeight + 'px', width: '100%' }"></div>

    <!-- Visible items container -->
    <div class="w-full h-full absolute top-0 left-0 pointer-events-none">
      <div
        v-for="viewItem in visibleItems"
        :key="viewItem.key"
        class="absolute left-0 w-full pointer-events-auto"
        :style="{
          transform: `translateY(${viewItem.top}px)`,
          height: itemSize + 'px',
        }"
      >
        <slot :item="viewItem.item" :index="viewItem.index" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  // Use Record<string, unknown> instead of any to satisfy linter
  items: Record<string, unknown>[];
  itemSize: number;
  keyField?: string;
  buffer?: number;
}>();

const scroller = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const containerHeight = ref(0);

const bufferAmount = computed(() => props.buffer ?? 2);
const keyFieldProp = computed(() => props.keyField || 'id');

const totalHeight = computed(() => props.items.length * props.itemSize);

let ticking = false;

// Remove unused 'e' parameter
const handleScroll = () => {
  if (!ticking) {
    window.requestAnimationFrame(() => {
      if (scroller.value) {
        scrollTop.value = scroller.value.scrollTop;
      }
      ticking = false;
    });
    ticking = true;
  }
};

// Resize Observer to update container height
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (scroller.value) {
    containerHeight.value = scroller.value.clientHeight;
    resizeObserver = new ResizeObserver((entries) => {
      // Direct access since we only observe one element
      const entry = entries[0];
      if (entry) {
        containerHeight.value = entry.contentRect.height;
      }
    });
    resizeObserver.observe(scroller.value);
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
});

const visibleItems = computed(() => {
  const count = props.items.length;
  if (count === 0) return [];

  const size = props.itemSize;
  const buffer = bufferAmount.value;
  const currentScroll = scrollTop.value;
  const height = containerHeight.value;

  // Calculate visible range
  let startIndex = Math.floor(currentScroll / size) - buffer;
  let endIndex = Math.ceil((currentScroll + height) / size) + buffer;

  // Clamp to bounds
  startIndex = Math.max(0, startIndex);
  endIndex = Math.min(count, endIndex);

  const visible = [];
  for (let i = startIndex; i < endIndex; i++) {
    const item = props.items[i];
    // If item is null/undefined (shouldn't happen with valid data), skip or handle
    if (!item) continue;

    const key = item[keyFieldProp.value];

    visible.push({
      item,
      index: i,
      top: i * size,
      // Cast key to PropertyKey (string | number | symbol) to satisfy v-for :key type
      key: (key !== undefined && key !== null ? key : i) as PropertyKey,
    });
  }
  return visible;
});
</script>
