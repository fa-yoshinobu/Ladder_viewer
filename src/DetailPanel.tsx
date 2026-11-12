import type { ComponentChildren } from 'preact';

export function DetailPanel({ children }: { children: ComponentChildren }) {
  return (
    <aside class="details">
      <div class="panel-title">命令の詳細</div>
      {children}
    </aside>
  );
}
