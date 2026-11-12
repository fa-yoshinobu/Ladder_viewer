import { useEffect } from 'preact/hooks';
import { useSetting } from './settings';

export function StColorToggle() {
  const [enabled, setEnabled] = useSetting('stHighlight');
  useEffect(() => {
    document.documentElement.dataset.stHighlight = String(enabled);
  }, [enabled]);
  return (
    <label class="comment-toggle">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => {
          const next = event.currentTarget.checked;
          setEnabled(next);
        }}
      />
      ST色分け
    </label>
  );
}
