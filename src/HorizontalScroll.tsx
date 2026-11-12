import type { ComponentChildren } from 'preact';

interface Props {
  enabled: boolean;
  width: number;
  contentWidth: number;
  height: number;
  label: string;
  children: ComponentChildren;
}
export function HorizontalScroll({ enabled, width, contentWidth, height, label, children }: Props) {
  return enabled ? (
    <div
      class="network-scroll"
      role="region"
      aria-label={label}
      tabIndex={0}
      style={{ width, height }}
    >
      <div style={{ width: contentWidth }}>{children}</div>
    </div>
  ) : (
    <>{children}</>
  );
}
