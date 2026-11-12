import { requireValue } from './requireValue';
import { blockRangeMenu, blockRangeText, comparisonRangeText } from './blockRangeCopy';
import { Fragment } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { adjacentDifferenceBlock, type CompareSide } from './compareCore';
import { DifferenceToolbar } from './DifferenceToolbar';
import { LADDER_WIDTH } from './ladderMetrics';
import type {
  DirectBlock,
  DirectCircuit,
  DirectInstruction,
  DirectNavigation,
  DirectSelection,
} from './directDrawing';
interface Props {
  blocks: DirectBlock[];
  zoom: number;
  display: 'both' | 'source' | 'target';
  sourceName: string;
  targetName: string;
  selected: DirectSelection | null;
  choose: (selection: DirectSelection) => void;
  context: (event: MouseEvent, selection: DirectSelection) => void;
  navigation: DirectNavigation | null;
  navigate: (id: string, side: CompareSide) => void;
  drop: (side: CompareSide, transfer: DataTransfer) => void;
  drag: (side: CompareSide | null) => void;
}
export function DirectComparisonView({
  blocks: input,
  zoom,
  display,
  sourceName,
  targetName,
  selected,
  choose,
  context,
  navigation,
  navigate,
  drop,
  drag,
}: Props) {
  const sourceScroll = useRef<HTMLDivElement>(null),
    targetScroll = useRef<HTMLDivElement>(null),
    lastJump = useRef(-1),
    handled = useRef<number | undefined>(undefined);
  const pending = useRef<{ side: CompareSide; circuit: DirectCircuit; id: string } | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 800 }),
    [active, setActive] = useState(0),
    [current, setCurrent] = useState(-1);
  const sides: CompareSide[] = display === 'both' ? ['source', 'target'] : [display];
  const scrollRef = (side: CompareSide) => (side === 'source' ? sourceScroll : targetScroll);
  const blocks = useMemo(() => {
    let top = 8;
    return input.map((block) => {
      const heights = {
        source: block.source.reduce((h, c) => h + c.height, 0),
        target: block.target.reduce((h, c) => h + c.height, 0),
      };
      const height = Math.max(
        56 * zoom,
        ...(display === 'both' ? [heights.source, heights.target] : [heights[display]]),
      );
      const result = { ...block, top, height };
      top += height;
      return result;
    });
  }, [input, display, zoom]);
  const previousBlocks = useRef(blocks);
  const visible = blocks.flatMap((block, index) =>
      block.top + block.height > viewport.top - 400 &&
      block.top < viewport.top + viewport.height + 400
        ? [{ ...block, index }]
        : [],
    ),
    total = blocks.at(-1);
  const width = LADDER_WIDTH * zoom,
    element = () => scrollRef(display === 'target' ? 'target' : 'source').current;
  const select = (instruction: DirectInstruction, side: CompareSide) => {
    choose({ instruction, side });
    setActive(
      blocks.findIndex((b) =>
        b[side].some((c) => c.instructions.some((i) => i.id === instruction.id)),
      ),
    );
    setCurrent(blocks.findIndex((b) => b.changes.some((c) => c.id === instruction.row)));
  };
  const scroll = (side: CompareSide, node: HTMLDivElement) => {
    const other = scrollRef(side === 'source' ? 'target' : 'source').current;
    if (other && Math.abs(other.scrollTop - node.scrollTop) > 1) other.scrollTop = node.scrollTop;
    setViewport({ top: node.scrollTop, height: node.clientHeight });
  };
  const jump = (index: number) => {
    const block = blocks[index];
    if (!block) return;
    for (const side of sides) scrollRef(side).current?.scrollTo({ top: block.top });
    const node = element();
    if (node) setViewport({ top: node.scrollTop, height: node.clientHeight });
    setActive(index);
    lastJump.current = index;
  };
  const goDifference = (index: number) => {
    jump(index);
    setCurrent(index);
    const change = blocks[index]?.changes[0];
    if (!change) return;
    for (const side of display === 'both' ? (['target', 'source'] as const) : sides) {
      const item = requireValue(blocks[index])
        [side].flatMap((c) => c.instructions)
        .find((i) => i.row === change.id);
      if (item) {
        choose({ side, instruction: item });
        break;
      }
    }
  };
  const destination = (direction: 1 | -1) => {
    const node = element(),
      last = blocks[lastJump.current];
    const end = node && node.scrollTop + node.clientHeight >= node.scrollHeight - 2;
    return adjacentDifferenceBlock(
      blocks,
      viewport.top,
      direction,
      end && last && last.top > viewport.top + 1 ? lastJump.current : -1,
    );
  };
  useLayoutEffect(() => {
    const old = previousBlocks.current,
      node = element();
    if (node && old !== blocks && old.length && blocks.length) {
      const index = Math.max(
        0,
        old.findIndex((b) => b.top + b.height > viewport.top),
      );
      const before = requireValue(old[index]),
        after = requireValue(blocks[Math.min(index, blocks.length - 1)]);
      const top =
        after.top +
        (Math.max(0, viewport.top - before.top) / Math.max(1, before.height)) * after.height;
      for (const side of sides) scrollRef(side).current?.scrollTo({ top });
    }
    previousBlocks.current = blocks;
    if (node) setViewport({ top: node.scrollTop, height: node.clientHeight });
  }, [blocks, display]);
  useEffect(() => {
    const node = element();
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setViewport({ top: node.scrollTop, height: node.clientHeight }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [display]);
  useLayoutEffect(() => {
    if (!navigation || handled.current === navigation.request || !sides.includes(navigation.side))
      return;
    const index = blocks.findIndex((b) =>
      b[navigation.side].some((c) => c.instructions.some((i) => i.id === navigation.id)),
    );
    if (index < 0) return;
    const block = requireValue(blocks[index]);
    let before = 0;
    for (const circuit of block[navigation.side]) {
      const instruction = circuit.instructions.find((i) => i.id === navigation.id);
      if (instruction) {
        const location = circuit.locations.find((l) => l.id === navigation.id);
        const top = block.top + before + (location?.y ?? 0);
        for (const side of sides) scrollRef(side).current?.scrollTo({ top });
        const node = element();
        if (node) setViewport({ top: node.scrollTop, height: node.clientHeight });
        choose({ side: navigation.side, instruction });
        setActive(index);
        setCurrent(index);
        pending.current = { side: navigation.side, circuit, id: instruction.id };
        handled.current = navigation.request;
        break;
      }
      before += circuit.height;
    }
  }, [navigation?.request, blocks, display]);
  useLayoutEffect(() => {
    const item = pending.current;
    if (!item) return;
    const outer = scrollRef(item.side).current;
    const node = Array.from(
      outer?.querySelectorAll<HTMLElement>('[data-direct-circuit]') ?? [],
    ).find((n) => n.dataset.directCircuit === item.circuit.id);
    if (!node || !outer) return;
    const location = item.circuit.locations.find((l) => l.id === item.id);
    if (location) {
      const scroller = node.querySelector<HTMLElement>('.network-scroll'),
        scrolling = scroller ?? outer;
      const origin = scroller
        ? 0
        : node.getBoundingClientRect().left - outer.getBoundingClientRect().left + outer.scrollLeft;
      const left = origin + location.x;
      if (
        left < scrolling.scrollLeft ||
        left + location.width > scrolling.scrollLeft + scrolling.clientWidth
      )
        scrolling.scrollLeft = Math.max(0, left - 16);
    }
    pending.current = null;
  }, [visible]);
  const options = blocks.flatMap((block, index) =>
    block.changes.length
      ? [
          {
            index,
            label:
              String(index + 1).padStart(3, '0') +
              ' ' +
              (block.source[0] ?? block.target[0])?.title.split('\n')[0] +
              ' · 相違 ' +
              block.changes.length +
              '行',
          },
        ]
      : [],
  );
  const preview = blocks[current]?.changes ?? [];
  return (
    <div class="comparison-view">
      <aside class="navigation comparison-nav">
        <div class="panel-title">
          回路一覧<span>{blocks.length}</span>
        </div>
        <div class="nav-list">
          {blocks.map((block, index) => (
            <button
              key={index}
              class={`nav-item ${active === index ? 'active' : ''} ${block.changes.length ? 'has-differences' : ''}`}
              onClick={() => jump(index)}
              onContextMenu={(e) =>
                blockRangeMenu(
                  e,
                  comparisonRangeText(blockRangeText(block.source), blockRangeText(block.target)),
                )
              }
            >
              <span class="number">{String(index + 1).padStart(3, '0')}</span>
              <div>
                <strong>{(block.source[0] ?? block.target[0])?.title.split('\n')[0]}</strong>
                <small>
                  {(block.source[0] ?? block.target[0])?.instructions.at(-1)?.op}{' '}
                  {(block.source[0] ?? block.target[0])?.instructions.at(-1)?.operands.join(' ')}
                </small>
                {!!block.changes.length && (
                  <small class="diff-nav-count">相違 {block.changes.length}行</small>
                )}
              </div>
            </button>
          ))}
        </div>
      </aside>
      <div class="compare-area">
        <DifferenceToolbar
          options={options}
          current={current}
          previous={destination(-1) >= 0}
          next={destination(1) >= 0}
          onPrevious={() => goDifference(destination(-1))}
          onNext={() => goDifference(destination(1))}
          onChoose={goDifference}
        />
        {!!preview.length && (
          <div class="diff-preview">
            {preview.map((c) => (
              <Fragment key={c.id}>
                <div class={`diff-${c.kind}`}>
                  <b>比較元 · {c.sourceLine}</b>
                  <code>{c.sourceText || '（なし）'}</code>
                </div>
                <div class={`diff-${c.kind}`}>
                  <b>比較先 · {c.targetLine}</b>
                  <code>{c.targetText || '（なし）'}</code>
                </div>
              </Fragment>
            ))}
          </div>
        )}
        <div
          class="compare-columns"
          style={display === 'both' ? undefined : { gridTemplateColumns: 'minmax(0,1fr)' }}
        >
          {sides.map((side) => (
            <section
              key={side}
              data-side={side}
              class="compare-column direct-pane"
              onDragOver={(e) => {
                e.preventDefault();
                drag(side);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) drag(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) drop(side, e.dataTransfer);
              }}
            >
              <div class="compare-heading">
                <strong>{side === 'source' ? '比較元' : '比較先'}</strong>
                <b>{side === 'source' ? sourceName : targetName}</b>
              </div>
              <div
                ref={scrollRef(side)}
                class="diagram compare-scroll"
                role="region"
                tabIndex={0}
                aria-label={`${side === 'source' ? '比較元' : '比較先'}ラダー表示`}
                onScroll={(e) => scroll(side, e.currentTarget)}
              >
                <div
                  style={{
                    height: total ? total.top + total.height + 8 : 0,
                    minWidth: width + 24,
                    position: 'relative',
                  }}
                >
                  {visible.map((block) => (
                    <div
                      key={block.index}
                      class={`comparison-block ${block.changes.length ? 'has-differences' : ''}`}
                      style={{
                        position: 'absolute',
                        top: block.top,
                        left: 12,
                        width,
                        minHeight: block.height,
                      }}
                    >
                      {block[side].length ? (
                        block[side].map((circuit) => (
                          <div
                            key={circuit.id}
                            data-direct-circuit={circuit.id}
                            style={{ height: circuit.height, width }}
                          >
                            {circuit.render(
                              selected?.side === side ? selected.instruction.id : '',
                              (i) => select(i, side),
                              (e, i) => context(e, { side, instruction: i }),
                              (id) => navigate(id, side),
                            )}
                          </div>
                        ))
                      ) : (
                        <div class="missing-circuit">この範囲に回路なし</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
