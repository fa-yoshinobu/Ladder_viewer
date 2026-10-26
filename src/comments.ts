import { addressParts } from './address';
export type DeviceComments = Record<string, string>;
export function deviceComment(operand: string | undefined, comments: DeviceComments): string {
  if (!operand) return '';
  const key = operand.trim().toUpperCase();
  if (Object.hasOwn(comments, key)) return comments[key];
  if (/^#P\d+$/i.test(key) && Object.hasOwn(comments, key.slice(1))) return comments[key.slice(1)];
  const base = addressParts(key).filter(part => !part.index).map(part => part.text).join('');
  return Object.hasOwn(comments, base) ? comments[base] : '';
}
export {commentLines} from './textLayout';
