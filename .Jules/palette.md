## 2024-05-23 - Feedback for External Actions

**Learning:** Users lack feedback when triggering external applications (like VLC), creating uncertainty about whether the action was registered.
**Action:** Always wrap async external triggers with a loading state (spinner/disabled button) to prevent rage-clicks and provide reassurance.
