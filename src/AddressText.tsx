import { addressParts } from './address';
export function AddressText({ text, svg = false, maxLength }: { text: string; svg?: boolean; maxLength?: number }) {
  const parts = addressParts(text);
  if (maxLength && text.length > maxLength && !parts.some(part => part.index)) return <>{text.slice(0, maxLength - 1)}…</>;
  return <>{parts.map((part, index) => !part.index ? part.text : svg
    ? <tspan key={index} class="index-modifier" data-index={part.text}>{part.text}</tspan>
    : <span key={index} class="index-modifier" title={`インデックス指定 ${part.text}`} data-index={part.text}>{part.text}</span>)}</>;
}
