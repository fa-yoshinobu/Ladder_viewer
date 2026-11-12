import { useEffect, useState } from 'preact/hooks';
import { ladderPalettes, type LadderPalette } from './ViewerToolbar';

interface Settings {
  theme: 'light' | 'dark';
  'ladderPalette-light': LadderPalette;
  'ladderPalette-dark': LadderPalette;
  stHighlight: boolean;
  showComments: boolean;
  viewMode: 'wrap' | 'scroll';
}
type Key = keyof Settings;
function fallback<K extends Key>(key: K): Settings[K] {
  const defaults: Settings = {
    theme:
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light',
    'ladderPalette-light': 'standard',
    'ladderPalette-dark': 'standard',
    stHighlight: false,
    showComments: true,
    viewMode: 'wrap',
  };
  return defaults[key];
}
export function readSetting<K extends Key>(key: K): Settings[K] {
  try {
    const raw = localStorage.getItem(key);
    const value =
      typeof fallback(key) === 'boolean'
        ? raw === 'true'
          ? true
          : raw === 'false'
            ? false
            : undefined
        : raw;
    const valid =
      key === 'theme'
        ? value === 'light' || value === 'dark'
        : key === 'viewMode'
          ? value === 'wrap' || value === 'scroll'
          : key.startsWith('ladderPalette-')
            ? ladderPalettes.some((palette) => palette.value === value)
            : typeof value === 'boolean';
    if (valid) return value as Settings[K];
  } catch {}
  return fallback(key);
}
export function writeSetting<K extends Key>(key: K, value: Settings[K]) {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
  window.dispatchEvent(new CustomEvent('viewer-setting', { detail: { key, value } }));
}
export function useSetting<K extends Key>(key: K) {
  const [value, setValue] = useState(() => readSetting(key));
  useEffect(() => {
    const changed = (event: Event) => {
      const change = (event as CustomEvent<{ key: Key; value: Settings[K] }>).detail;
      if (change.key === key) setValue(change.value);
    };
    const stored = (event: StorageEvent) => {
      if (event.key === key || event.key === null) setValue(readSetting(key));
    };
    window.addEventListener('viewer-setting', changed);
    window.addEventListener('storage', stored);
    return () => {
      window.removeEventListener('viewer-setting', changed);
      window.removeEventListener('storage', stored);
    };
  }, [key]);
  const update = (next: Settings[K]) => {
    setValue(next);
    writeSetting(key, next);
  };
  return [value, update] as const;
}
