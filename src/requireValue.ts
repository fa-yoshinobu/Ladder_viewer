// Indexed reads in a validated range must still fail explicitly if that invariant breaks.
export function requireValue<T>(value: T | undefined): T {
  if (value === undefined) throw new RangeError('必要な配列要素または項目がありません。');
  return value;
}
