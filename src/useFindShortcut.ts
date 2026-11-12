import { useEffect } from 'preact/hooks';

export function useFindShortcut() {
  useEffect(() => {
    const find = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f') return;
      const field = document.querySelector<HTMLInputElement>('.search-query');
      if (!field) return;
      event.preventDefault();
      field.focus();
      field.select();
    };
    window.addEventListener('keydown', find);
    return () => window.removeEventListener('keydown', find);
  }, []);
}
