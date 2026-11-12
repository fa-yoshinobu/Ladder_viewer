export function MessageBanner({
  text,
  warning = false,
  dismiss,
}: {
  text: string;
  warning?: boolean;
  dismiss: () => void;
}) {
  if (!text) return null;
  return (
    <div
      class={warning ? 'warning message-banner' : 'error message-banner'}
      role={warning ? 'status' : 'alert'}
    >
      <span>{text}</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label={warning ? '警告を閉じる' : 'エラーを閉じる'}
      >
        ×
      </button>
    </div>
  );
}
