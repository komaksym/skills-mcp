# Deterministic Helper

Run this deterministic helper without changing its algorithm:

```javascript
function normalizeLabels(labels) {
  return labels.map((label) => label.trim().toLowerCase()).sort();
}
```
