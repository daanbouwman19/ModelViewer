## 2025-02-18 - Recursive Array Concatenation Bottleneck

**Learning:** The codebase used `array.concat(recursiveCall())` for flattening album trees. This creates $O(N^2)$ complexity due to repeated array copying.
**Action:** Replace similar recursive patterns (e.g., in `useSlideshow.ts`) with iterative stack-based traversal or a recursive accumulator to achieve $O(N)$.
