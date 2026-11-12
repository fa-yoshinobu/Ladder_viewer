import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';

export function VirtualNetworkList<T extends { id: string }>({
  items,
  active,
  renderItem,
}: {
  items: readonly T[];
  active: string;
  renderItem: (item: T, index: number) => ComponentChildren;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 600 });
  const [rowHeight, setRowHeight] = useState(64);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const update = () => {
      const row = element.querySelector('.nav-item');
      if (row) setRowHeight(row.getBoundingClientRect().height || 64);
      setViewport({ top: element.scrollTop, height: element.clientHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [items]);
  useLayoutEffect(() => {
    const element = root.current,
      index = items.findIndex((item) => item.id === active);
    if (!element || index < 0) return;
    const top = index * rowHeight,
      bottom = top + rowHeight;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (bottom > element.scrollTop + element.clientHeight)
      element.scrollTop = bottom - element.clientHeight;
    setViewport({ top: element.scrollTop, height: element.clientHeight });
  }, [active, items, rowHeight]);
  const first = Math.max(0, Math.floor(viewport.top / rowHeight) - 5);
  const end = Math.min(items.length, Math.ceil((viewport.top + viewport.height) / rowHeight) + 5);
  return (
    <div
      class="nav-list"
      ref={root}
      onScroll={(event) =>
        setViewport({
          top: event.currentTarget.scrollTop,
          height: event.currentTarget.clientHeight,
        })
      }
    >
      <div style={{ height: items.length * rowHeight, position: 'relative' }}>
        {items.slice(first, end).map((item, offset) => (
          <div
            key={item.id}
            style={{ position: 'absolute', top: (first + offset) * rowHeight, width: '100%' }}
          >
            {renderItem(item, first + offset)}
          </div>
        ))}
      </div>
    </div>
  );
}
