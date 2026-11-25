import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { visibleRange } from './visibleRange';

const groupSize = 16;
type Group = { top: number; height: number };

// Measure the original rows in groups. Empty labels, font fallback and the optional
// difference count all affect native button height and the scrollbar position.
export function ComparisonNetworkList<T>({
  items,
  renderItem,
}: {
  items: T[];
  renderItem: (item: T, index: number) => ComponentChildren;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [measurement, setMeasurement] = useState<{ items: T[]; groups: Group[] } | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 0 });
  const [focusGroup, setFocusGroup] = useState(-1);
  const groups = measurement?.items === items ? measurement.groups : undefined;
  const count = Math.ceil(items.length / groupSize);

  useLayoutEffect(() => {
    const list = root.current;
    if (!list || count <= 4) {
      setMeasurement(null);
      return;
    }
    let width = list.clientWidth;
    const update = () => {
      if (width !== list.clientWidth) {
        width = list.clientWidth;
        setMeasurement(null);
      }
      setViewport({ top: list.scrollTop, height: list.clientHeight });
    };
    const fontsChanged = () => setMeasurement(null);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(list);
    document.fonts.addEventListener('loadingdone', fontsChanged);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', fontsChanged);
    };
  }, [count]);
  useLayoutEffect(() => {
    const list = root.current;
    if (!list || count <= 4 || groups || !list.clientHeight) return;
    let top = 0;
    const measured = Array.from(list.firstElementChild!.children, (node) => {
      const height = node.getBoundingClientRect().height;
      const group = { top, height };
      top += height;
      return group;
    });
    setMeasurement({ items, groups: measured });
  }, [items, groups, viewport.height]);

  if (count <= 4) return <div class="nav-list">{items.map(renderItem)}</div>;
  let indices: number[];
  if (groups) {
    const [first, end] = visibleRange(
      count,
      (i) => groups[i]!,
      viewport.top,
      viewport.top + viewport.height,
    );
    // Keep both Tab entry points and the neighbours of the focused button in document order.
    const shown = new Set([0, count - 1]);
    for (let i = Math.max(0, first - 1); i < Math.min(count, end + 1); i++) shown.add(i);
    if (focusGroup >= 0)
      for (let i = Math.max(0, focusGroup - 1); i < Math.min(count, focusGroup + 2); i++)
        shown.add(i);
    indices = Array.from(shown).sort((a, b) => a - b);
  } else indices = Array.from({ length: count }, (_, index) => index);
  const last = groups?.at(-1);
  return (
    <div
      class="nav-list"
      ref={root}
      onScroll={(e) =>
        setViewport({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })
      }
      onFocusOut={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusGroup(-1);
      }}
    >
      <div style={last && { position: 'relative', height: last.top + last.height }}>
        {indices.map((index) => (
          <div
            key={index}
            onFocusIn={() => setFocusGroup(index)}
            style={groups && { position: 'absolute', width: '100%', top: groups[index]!.top }}
          >
            {items
              .slice(index * groupSize, (index + 1) * groupSize)
              .map((item, offset) => renderItem(item, index * groupSize + offset))}
          </div>
        ))}
      </div>
    </div>
  );
}
