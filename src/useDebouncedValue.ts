import { useEffect, useState } from 'preact/hooks';

export function useDebouncedValue(value: string) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), 180);
    return () => clearTimeout(timer);
  }, [value]);
  return value.trim() ? settled : '';
}
