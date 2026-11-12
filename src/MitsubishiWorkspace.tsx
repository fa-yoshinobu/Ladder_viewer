import { DetailPanel } from './DetailPanel';
import { AddressText } from './AddressText';
import { blockRangeMenu, blockRangeText } from './blockRangeCopy';
import { CommentListContext, openCommentList } from './CommentList';
import { commentListRequest } from './commentListData';
import { deviceComment } from './comments';
import { type ComparisonDisplay } from './comparisonDisplay';
import { ComparisonView } from './ComparisonView';
import { differenceLabels } from './model';
import { NetworkDrawing } from './NetworkDrawing';
import { SearchBar } from './SearchBar';
import type { useViewerWorkspace } from './useViewerWorkspace';
import { ViewerHeader } from './ViewerHeader';
import { ViewerToolbar } from './ViewerToolbar';
import { VirtualNetworkList } from './VirtualNetworkList';
import { MessageBanner } from './MessageBanner';
export function MitsubishiWorkspace({
  commentList,
  load,
  selected,
  theme,
  setDirectComparison,
  programNames,
  program,
  comparison,
  busy,
  chooseProgram,
  toggleTheme,
  nativeCsv,
  openSelection,
  searchQuery,
  searchMode,
  searchHeadings,
  searchCurrent,
  setSearchQuery,
  setSearchMode,
  moveSearch,
  comparisonDisplay,
  changeComparisonDisplay,
  commentCount,
  showComments,
  setShowComments,
  ladderPalette,
  changeLadderPalette,
  viewMode,
  changeViewMode,
  zoom,
  fitToWidth,
  zoomOut,
  zoomIn,
  setZoom,
  error,
  warning,
  dismissError,
  dismissWarning,
  showComparison,
  comparisonWidth,
  comparisonNavigation,
  rememberComparisonPosition,
  rowHeight,
  setSelected,
  setSelectedSide,
  deviceComments,
  displayedProgram,
  active,
  jump,
  scroll,
  setViewport,
  progress,
  total,
  layouts,
  visible,
  chooseDisplayedInstruction,
  navigateInstruction,
  selectedSide,
  selectedProgram,
}: ReturnType<typeof useViewerWorkspace>) {
  return (
    <CommentListContext.Provider value={commentList}>
      <div
        class="app"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer?.files.length) void load(Array.from(e.dataTransfer.files));
        }}
      >
        <ViewerHeader
          onComments={
            commentList
              ? () =>
                  openCommentList(
                    commentListRequest(commentList, selected?.operands, theme === 'dark')!,
                  )
              : undefined
          }
          onCompare={() => setDirectComparison(true)}
          programNames={programNames}
          currentName={program?.name ?? ''}
          description={
            program
              ? comparison
                ? comparison.differentRows
                  ? `${comparison.differentRows}行相違`
                  : '比較元・比較先 一致'
                : program.cpu
              : ''
          }
          busy={busy}
          dark={theme === 'dark'}
          onChoose={chooseProgram}
          onToggleTheme={toggleTheme}
          onAbout={() => nativeCsv?.postMessage({ type: 'show-about', dark: theme === 'dark' })}
          onOpenFiles={() => openSelection('open-csv')}
          onOpenFolder={() => openSelection('open-folder')}
        />
        <div class="subbar">
          {program && (
            <SearchBar
              query={searchQuery}
              mode={searchMode}
              results={searchHeadings}
              current={searchCurrent}
              onQuery={setSearchQuery}
              onMode={setSearchMode}
              onMove={moveSearch}
              onClear={() => setSearchQuery('')}
            />
          )}
          <div>
            {comparison && (
              <label class="view-mode">
                表示
                <select
                  aria-label="比較の表示"
                  value={comparisonDisplay}
                  disabled={busy}
                  onChange={(e) =>
                    changeComparisonDisplay(e.currentTarget.value as ComparisonDisplay)
                  }
                >
                  <option value="both">左右比較</option>
                  <option value="source">比較元のみ</option>
                  <option value="target">比較先のみ</option>
                </select>
              </label>
            )}
            <ViewerToolbar
              hasComments={commentCount > 0}
              comments={showComments}
              onComments={setShowComments}
              dark={theme === 'dark'}
              palette={ladderPalette}
              onPalette={changeLadderPalette}
              viewMode={viewMode}
              onViewMode={changeViewMode}
              zoom={zoom}
              onFit={fitToWidth}
              onZoomOut={zoomOut}
              onZoomIn={zoomIn}
              onResetZoom={() => setZoom(1)}
            />
          </div>
        </div>
        <MessageBanner text={error} dismiss={dismissError} />
        <MessageBanner text={warning} warning dismiss={dismissWarning} />
        <div class={`workspace ${showComparison ? 'comparison-workspace' : ''}`}>
          <div ref={comparisonWidth} class="comparison-host" hidden={!showComparison}>
            {showComparison && program && (
              <ComparisonView
                key={program.name}
                program={program}
                navigationTarget={comparisonNavigation}
                onPosition={rememberComparisonPosition}
                viewMode={viewMode}
                zoom={zoom}
                rowHeight={rowHeight}
                selected={selected?.id ?? ''}
                choose={(i, side) => {
                  setSelected(i);
                  setSelectedSide(side);
                }}
                comments={deviceComments}
                showComments={showComments}
              />
            )}
          </div>
          {!showComparison && (
            <>
              <aside class="navigation">
                <div class="panel-title">
                  回路一覧 <span>{displayedProgram?.networks.length ?? 0}</span>
                </div>
                <VirtualNetworkList
                  items={displayedProgram?.networks ?? []}
                  active={active}
                  renderItem={(n, index) => (
                    <button
                      class={`nav-item ${active === n.id ? 'active' : ''}`}
                      onClick={() => jump(n.id)}
                      onContextMenu={(e) => blockRangeMenu(e, blockRangeText([n]))}
                      key={n.id}
                      data-network-id={n.id}
                    >
                      <span class="number">{String(index + 1).padStart(3, '0')}</span>
                      <div>
                        <strong>{n.title || `STEP ${n.step}`}</strong>
                        <small>
                          {n.actions[0]?.instruction.op}{' '}
                          {n.actions[0]?.instruction.operands.join(' ') || ''}
                          {n.warnings.length ? ' ⚠' : ''}
                        </small>
                      </div>
                    </button>
                  )}
                />
              </aside>
              <main
                ref={scroll}
                class="diagram"
                onScroll={(e) =>
                  setViewport({
                    top: e.currentTarget.scrollTop,
                    height: e.currentTarget.clientHeight,
                  })
                }
                aria-label="ラダー表示"
              >
                {busy && (
                  <div class="loading" role="status">
                    {progress || 'CSVを解析しています…'}
                  </div>
                )}
                {!program && !busy ? (
                  <div class="empty">
                    <span class="empty-mark">─┤ ├─</span>
                    <p>
                      CSV/MNMをドロップするか、「ファイルを開く」「フォルダーを開く」で選択してください。
                    </p>
                    <button class="primary" onClick={() => openSelection('open-csv')}>
                      ファイルを開く
                    </button>
                  </div>
                ) : comparison && displayedProgram?.networks.length === 0 ? (
                  <div class="empty">この側に回路はありません。</div>
                ) : (
                  <div
                    style={{
                      height: total ? total.top + total.height + 8 : 0,
                      minWidth: Math.max(0, ...layouts.map((l) => l.width + 24)),
                      position: 'relative',
                    }}
                  >
                    {visible.map((l) => (
                      <section
                        key={l.n.id}
                        data-network-id={l.n.id}
                        class="network"
                        style={{ position: 'absolute', top: l.top, left: 12, width: l.width }}
                      >
                        <NetworkDrawing
                          network={l.n}
                          viewMode={viewMode}
                          selected={selected?.id ?? ''}
                          choose={chooseDisplayedInstruction}
                          navigate={(id) =>
                            navigateInstruction(
                              id,
                              comparisonDisplay === 'target' ? 'target' : 'source',
                            )
                          }
                          zoom={zoom}
                          rowHeight={rowHeight}
                          comments={deviceComments}
                          showComments={showComments}
                        />
                      </section>
                    ))}
                  </div>
                )}
              </main>
            </>
          )}
          <DetailPanel>
            {selected ? (
              <div class="detail-content">
                <span class="eyebrow">
                  {comparison ? `${selectedSide === 'source' ? '比較元' : '比較先'} · ` : ''}STEP{' '}
                  {selected.step || '—'}
                </span>
                <h2>{selected.op}</h2>
                <dl>
                  {selected.difference && (
                    <>
                      <dt class={`difference-label diff-${selected.difference.kind}`}>
                        {differenceLabels[selected.difference.kind]}
                      </dt>
                      <dd>
                        {selectedSide === 'source' ? '比較先' : '比較元'}:{' '}
                        {selected.difference.otherText || 'なし'}
                        <br />
                        STEP {selected.difference.otherStep || '—'}
                      </dd>
                    </>
                  )}
                  {selected.controlFlow && (
                    <>
                      <dt>制御</dt>
                      <dd>
                        {selected.controlFlow.label}
                        {selected.controlFlow.targetStep !== undefined && (
                          <>
                            <br />
                            {selected.controlFlow.targetId ? (
                              <button
                                type="button"
                                class="step-link"
                                onClick={() =>
                                  navigateInstruction(selected.controlFlow!.targetId!, selectedSide)
                                }
                              >
                                STEP {selected.controlFlow.targetStep || '—'}
                              </button>
                            ) : (
                              <>対応STEP {selected.controlFlow.targetStep}</>
                            )}
                          </>
                        )}
                      </dd>
                    </>
                  )}
                  <dt>オペランド</dt>
                  <dd>
                    {selected.operands.length
                      ? selected.operands.map((o, index) => (
                          <div
                            class={`operand ${selected.difference?.operandChanges.includes(index) ? 'changed-operand' : ''}`}
                          >
                            <span>{index + 1}</span>
                            <div>
                              <code>
                                <AddressText text={o} />
                              </code>
                              {deviceComment(o, deviceComments) && (
                                <div class="operand-comment">
                                  {deviceComment(o, deviceComments)}
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      : 'なし'}
                  </dd>
                  {selected.inlineST && (
                    <>
                      <dt>インラインST</dt>
                      <dd>
                        <pre class="detail-st-code">{selected.inlineST.text}</pre>
                      </dd>
                    </>
                  )}
                  <dt>元ファイル</dt>
                  <dd>
                    {selectedProgram?.name}
                    <br />
                    {comparison && (
                      <>
                        {selectedSide === 'source'
                          ? comparison.sourceProject
                          : comparison.targetProject}
                        <br />
                      </>
                    )}
                    CSV {selected.sourceRow}行
                  </dd>
                </dl>
              </div>
            ) : (
              <div class="detail-placeholder">命令を選択してください。</div>
            )}
          </DetailPanel>
        </div>
        <footer>
          <span class="status-dot" />
          {busy
            ? '解析中'
            : displayedProgram
              ? `${programNames.length}プログラム · ${showComparison && comparison ? `元 ${displayedProgram.instructions.length.toLocaleString()} / 先 ${comparison.target.instructions.length.toLocaleString()}` : displayedProgram.instructions.length.toLocaleString()} 命令 · ${displayedProgram.networks.length} 回路${commentCount ? ` · コメント ${commentCount.toLocaleString()}件` : ''}`
              : 'CSV/MNMを選択してください'}
        </footer>
      </div>
    </CommentListContext.Provider>
  );
}
