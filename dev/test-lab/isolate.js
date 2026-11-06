'use strict';
// Keep production UI initialization from changing saved preferences, even on a reused port.
for (const name of ['localStorage', 'sessionStorage']) {
  const data = new Map();
  Object.defineProperty(window, name, { value: {
    getItem: key => data.get(String(key)) ?? null,
    setItem: (key, value) => data.set(String(key), String(value)),
    removeItem: key => data.delete(String(key)), clear: () => data.clear(),
    key: index => [...data.keys()][index] ?? null, get length() { return data.size; },
  } });
}
