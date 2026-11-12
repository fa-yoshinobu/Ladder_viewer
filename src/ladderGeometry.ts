export function placeSymbolColumn(column: number, span: number, columns: number): number {
  return Math.floor(column / columns) === Math.floor((column + span - 1) / columns)
    ? column
    : Math.ceil(column / columns) * columns;
}
