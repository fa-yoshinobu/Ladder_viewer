import { createContext, render } from 'preact';
import { nativeCsvBridge } from './nativeCsv';
import { commentListTsv, type CommentListData, type CommentListRequest } from './commentListData';

export const CommentListContext = createContext<CommentListData | undefined>(undefined);
let closeActiveMenu: (() => void) | undefined;
export function closeInstructionMenu() {
  closeActiveMenu?.();
}
export function showInstructionMenu(
  event: MouseEvent,
  text: string,
  commentList?: CommentListRequest,
  onCopyError?: () => void,
) {
  closeInstructionMenu();
  const bridge = nativeCsvBridge();
  if (bridge) {
    bridge.postMessage({ type: 'instruction-menu', text, commentList });
    return;
  }
  const menu = document.createElement('div');
  menu.setAttribute('role', 'menu');
  menu.className = 'kv-context-menu';
  menu.style.left = Math.min(event.clientX, innerWidth - 180) + 'px';
  menu.style.top = Math.min(event.clientY, innerHeight - 90) + 'px';
  document.body.append(menu);
  const close = () => {
    render(null, menu);
    menu.remove();
    document.removeEventListener('pointerdown', outside);
    document.removeEventListener('keydown', escape);
    window.removeEventListener('resize', close);
    if (closeActiveMenu === close) closeActiveMenu = undefined;
  };
  closeActiveMenu = close;
  const outside = (e: Event) => {
      if (!menu.contains(e.target as Node)) close();
    },
    escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
  document.addEventListener('pointerdown', outside);
  document.addEventListener('keydown', escape);
  window.addEventListener('resize', close);
  render(
    <>
      <button
        role="menuitem"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(close, () => {
            if (onCopyError) {
              close();
              onCopyError();
            } else menu.textContent = 'コピーできませんでした。';
          });
        }}
      >
        コピー
      </button>
      {commentList && (
        <button
          role="menuitem"
          onClick={() => {
            close();
            openCommentList(commentList);
          }}
        >
          コメントリスト
        </button>
      )}
    </>,
    menu,
  );
}
// The Windows host uses a modeless native grid; ordinary browsers get a separate table window.
export function openCommentList(request: CommentListRequest) {
  const bridge = nativeCsvBridge();
  if (bridge) {
    bridge.postMessage({ type: 'show-comment-list', commentList: request });
    return;
  }
  const popup = window.open(
    '',
    'LadderViewerComments',
    'width=820,height=640,resizable=yes,scrollbars=yes',
  );
  if (!popup) return;
  popup.document.title = 'コメントリスト — ' + request.title;
  const style = popup.document.createElement('style');
  style.textContent = `body{margin:20px;font:14px "Yu Gothic UI",sans-serif;background:${request.dark ? '#1f1f1f' : '#fff'};color:${request.dark ? '#f2f2f2' : '#1a1a1a'}}button{padding:6px 14px;margin-bottom:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:7px 12px;text-align:left;white-space:pre-wrap}th{position:sticky;top:0;background:${request.dark ? '#2a2a2a' : '#f2f2f2'}}tr[data-selected=true]{outline:2px solid #527acc;background:${request.dark ? '#1f3a5c' : '#e8f1fe'}}td:first-child{font-family:Consolas,monospace;width:130px}`;
  popup.document.head.append(style);
  render(
    <>
      <h2>コメントリスト — {request.title}</h2>
      <button
        onClick={() => void popup.navigator.clipboard.writeText(commentListTsv(request.entries))}
      >
        すべてコピー
      </button>
      <span> アドレスとコメントを2列でコピーできます。</span>
      <table>
        <thead>
          <tr>
            <th>アドレス</th>
            <th>コメント</th>
          </tr>
        </thead>
        <tbody>
          {request.entries.map((row, index) => (
            <tr key={index} data-selected={row.address === request.selectedAddress}>
              <td>{row.address}</td>
              <td>{row.comment}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>,
    popup.document.body,
  );
  popup.requestAnimationFrame(() =>
    popup.document.querySelector('[data-selected=true]')?.scrollIntoView({ block: 'center' }),
  );
  popup.focus();
}
