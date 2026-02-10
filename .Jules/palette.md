## 2025-02-18 - Invisible Controls Trap
**Learning:** Using `opacity: 0` for fading out controls leaves them interactive (keyboard & mouse), creating a confusing "invisible controls trap".
**Action:** Use `v-show` with `<Transition>` or `inert` attribute to ensure hidden elements are removed from the accessibility tree and interaction layer.
