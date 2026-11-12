import { csvRows, instructionFields, pinDefinition, isFunctionCall } from './gxFormat';
import { diffArrays } from 'diff';
import { gridLayout, layoutGrid, drawingPages, drawingMetrics, ROW } from './layout';
import { compareConnections } from './connections';
import { alignSequence } from './compareCore';
import { alignBranches } from './branchAlignment';
import { contactKey } from './instructions';
import {
  buildProgram,
  type Instruction,
  type Network,
  type Program,
  type ComparisonChange,
} from './model';

export const isComparisonHeader = (row: string[]) =>
  row[0] === '行' &&
  row.includes('照合元') &&
  row.includes('照合先') &&
  (row.includes('照合結果') || row.includes('比較結果'));

// Statement and note lines in comparison results. GX Works3 prefixes both with ';'. GX Works2 (比較結果) shows statements as
// plain text and indents notes, wrapping embedded notes in <>. A leading '*' marks project-only text, which GX shows without it.
export function comparisonComment(
  raw: string,
  legacy: boolean,
): { kind: 'statement' | 'note'; text: string } | null {
  const text = raw.trim();
  if (text.startsWith(';')) return { kind: 'statement', text: text.slice(1).replace(/^\*/, '') };
  if (!legacy || !text || isFunctionCall(text) || pinDefinition(text)) return null;
  if (/^\s/.test(raw))
    return { kind: 'note', text: text.replace(/^\*/, '').replace(/^<(.*)>$/, '$1') };
  // Keep uppercase mnemonics (including unknown ones) and pointers; lowercase headings are text.
  if (/^[*[]/.test(text) || /[a-z]|[^\x00-\x7f]/.test(text.split(/\s/)[0]))
    return { kind: 'statement', text: text.replace(/^\*/, '') };
  return null;
}

export function parseComparison(text: string, name: string): Program {
  const parsed = csvRows(text);
  if (parsed.errors.length) throw new Error(`CSV形式エラー: ${parsed.errors[0].message}`);
  const header = parsed.data.findIndex(isComparisonHeader);
  if (header < 0) throw new Error('照合元・照合先の列がありません。');
  const columns = parsed.data[header],
    sourceColumn = columns.indexOf('照合元'),
    targetColumn = columns.indexOf('照合先'),
    legacy = columns.includes('比較結果');
  if (columns[sourceColumn - 1] !== 'ステップ' || columns[targetColumn - 1] !== 'ステップ')
    throw new Error('照合元・照合先に対応するステップ列がありません。');
  const metadataRows = parsed.data.slice(0, header).map((row) => row[0] ?? '');
  const metadata = (key: string) =>
    metadataRows
      .find((value) => value.startsWith(key + '：') || value.startsWith(key + ':'))
      ?.slice(key.length + 1)
      .trim() ?? '';
  const legacyDataName = (side: '照合元' | '照合先') => {
    const index = metadataRows.findIndex(
      (value) => value.startsWith(side + '：') || value.startsWith(side + ':'),
    );
    if (index < 0) return '';
    return (
      /^\s*->\s*(.+?)\s*$/
        .exec(metadataRows[index + 1] ?? '')?.[1]
        .split(/[\\/]/)
        .at(-1)
        ?.trim() ?? ''
    );
  };
  const rows = parsed.data.slice(header + 1);
  if (!rows.length) throw new Error('照合データがありません。');
  if (rows.some((row) => row.length !== columns.length || !/^\d+$/.test(row[0])))
    throw new Error('照合行の列数または行番号が不正です。');
  const tokens = (text: string) => text.match(/"(?:[^"]|"")*"|\S+/g) ?? [];
  const records = (column: number) =>
    rows.flatMap((row, index) =>
      row[column].trim()
        ? [
            {
              text: row[column].trim(),
              raw: row[column],
              step: row[column - 1].trim(),
              csvRow: header + index + 2,
            },
          ]
        : [],
    );
  const sourceRecords = records(sourceColumn),
    targetRecords = records(targetColumn);
  type RecordLine = (typeof sourceRecords)[number];
  const aligned: { source?: RecordLine; target?: RecordLine }[] = [];
  const describe = (records: RecordLine[]) => {
    const instructions: Instruction[] = records.flatMap((record, index) => {
      if (comparisonComment(record.raw, legacy)) return [];
      const { op, operands } = instructionFields(record.text);
      return [
        {
          id: String(index),
          sourceRow: record.csvRow,
          step: record.step,
          op,
          operands,
          note: '',
          statement: '',
        },
      ];
    });
    const networks = buildProgram(instructions, name).networks;
    const roles = new Map<number, 'condition' | 'action' | 'structure'>();
    for (const network of networks) {
      const visit = (logic: NonNullable<typeof network.evaluation> | null) => {
        if (!logic) return;
        if (logic.kind === 'contact') roles.set(Number(logic.instruction.id), 'condition');
        else logic.children.forEach(visit);
      };
      for (const action of network.actions) {
        visit(action.condition);
        roles.set(Number(action.instruction.id), 'action');
      }
      visit(network.evaluation ?? null);
    }
    const descriptors = new Map(
      records.map((record, index) => {
        const comment = comparisonComment(record.raw, legacy);
        const { op, operands } = instructionFields(record.text);
        const role = comment ? comment.kind : (roles.get(index) ?? 'structure');
        const family = ['MPS', 'MRD', 'MPP'].includes(op)
          ? 'stack'
          : ['ANB', 'ORB'].includes(op)
            ? 'block-join'
            : op;
        return [
          record,
          {
            op,
            operands,
            role,
            family,
            contactKey: role === 'condition' ? contactKey(op, operands) : undefined,
          },
        ] as const;
      }),
    );
    return { networks, descriptors };
  };
  const sourceDescription = describe(sourceRecords),
    targetDescription = describe(targetRecords);
  const key = (record: RecordLine) =>
    sourceDescription.descriptors.get(record)?.contactKey ??
    targetDescription.descriptors.get(record)?.contactKey ??
    JSON.stringify(tokens(record.text));
  function alignRecords(source: RecordLine[], target: RecordLine[]) {
    const sourceKeys = new Set(source.map(key)),
      targetKeys = new Set(target.map(key));
    aligned.push(
      ...alignSequence(source, target, key, (a, b) => {
        const left = sourceDescription.descriptors.get(a)!,
          right = targetDescription.descriptors.get(b)!;
        if (left.role !== right.role || targetKeys.has(key(a)) || sourceKeys.has(key(b))) return 0;
        if (left.role === 'statement' || left.role === 'note') return 1;
        if (left.role === 'structure' && left.family !== right.family) return 0;
        if (left.op === right.op) {
          const common = left.operands.filter(
            (operand, index) => operand === right.operands[index],
          ).length;
          return 1 + common / Math.max(1, left.operands.length, right.operands.length);
        }
        return JSON.stringify(left.operands) === JSON.stringify(right.operands) &&
          (left.operands.length > 0 || left.family === right.family)
          ? 0.5
          : 0;
      }),
    );
  }
  // Anchor complete unchanged circuits before matching individual commands with repeated prefixes.
  const circuits = (networks: Network[]) => {
    return networks.map((network) => ({
      start: Number(network.instructions[0].id),
      end: Number(network.instructions.at(-1)!.id) + 1,
      key: JSON.stringify(
        network.instructions.map((instruction) => [instruction.op, ...instruction.operands]),
      ),
    }));
  };
  const sourceCircuits = circuits(sourceDescription.networks),
    targetCircuits = circuits(targetDescription.networks);
  let sourceCircuit = 0,
    targetCircuit = 0,
    sourceStart = 0,
    targetStart = 0;
  for (const chunk of diffArrays(
    sourceCircuits.map((c) => c.key),
    targetCircuits.map((c) => c.key),
  )) {
    if (chunk.removed) {
      sourceCircuit += chunk.count;
      continue;
    }
    if (chunk.added) {
      targetCircuit += chunk.count;
      continue;
    }
    for (let index = 0; index < chunk.count; index++) {
      const source = sourceCircuits[sourceCircuit++],
        target = targetCircuits[targetCircuit++];
      alignRecords(
        sourceRecords.slice(sourceStart, source.start),
        targetRecords.slice(targetStart, target.start),
      );
      alignRecords(
        sourceRecords.slice(source.start, source.end),
        targetRecords.slice(target.start, target.end),
      );
      sourceStart = source.end;
      targetStart = target.end;
    }
  }
  alignRecords(sourceRecords.slice(sourceStart), targetRecords.slice(targetStart));
  const changes: ComparisonChange[] = [];
  let shiftedSteps = 0;
  aligned.forEach((pair, index) => {
    const sourceText = pair.source?.text ?? '',
      targetText = pair.target?.text ?? '';
    if (
      pair.source &&
      pair.target &&
      JSON.stringify(tokens(sourceText)) === JSON.stringify(tokens(targetText))
    ) {
      if (pair.source.step !== pair.target.step) shiftedSteps++;
      return;
    }
    changes.push({
      sourceRow: pair.source?.csvRow ?? pair.target!.csvRow,
      alignmentRow: index + 1,
      sourceCsvRow: pair.source?.csvRow,
      targetCsvRow: pair.target?.csvRow,
      sourceText,
      targetText,
      sourceStep: pair.source?.step ?? '',
      targetStep: pair.target?.step ?? '',
      kind: !pair.source ? 'added' : !pair.target ? 'removed' : 'changed',
    });
  });
  const changesByAlignment = new Map(changes.map((change) => [change.alignmentRow, change]));
  function side(which: 'source' | 'target'): Program {
    const instructions: Instruction[] = [];
    let statement = '';
    aligned.forEach((pair, index) => {
      const record = pair[which];
      if (!record) return;
      const value = record.text;
      const comment = comparisonComment(record.raw, legacy);
      if (comment) {
        const previous = instructions.at(-1);
        if (comment.kind === 'note' && previous) {
          previous.note = [previous.note, comment.text].filter(Boolean).join('\n');
          const change = changesByAlignment.get(index + 1);
          if (change) change.noteOwnerRow ??= previous.comparisonRow;
        } else statement = [statement, comment.text].filter(Boolean).join('\n');
        return;
      }
      const { op, operands, note } = instructionFields(value);
      const other = pair[which === 'source' ? 'target' : 'source'];
      const otherFields = instructionFields(other?.text ?? '');
      const change = changesByAlignment.get(index + 1);
      const difference = change
        ? {
            kind: change.kind,
            opChanged: change.kind === 'changed' && op !== otherFields.op,
            operandChanges:
              change.kind === 'changed'
                ? operands.flatMap((token, index) =>
                    token !== otherFields.operands[index] ? [index] : [],
                  )
                : [],
            otherText: other?.text ?? '',
            otherStep: other?.step ?? '',
          }
        : undefined;
      instructions.push({
        id: `${which}-row-${record.csvRow}`,
        sourceRow: record.csvRow,
        comparisonRow: index + 1,
        step: record.step,
        op,
        operands,
        note,
        statement,
        difference,
      });
      statement = '';
    });
    return buildProgram(instructions, name);
  }
  const source = side('source'),
    target = side('target');
  if (!source.instructions.length && !target.instructions.length)
    throw new Error('両側に命令がありません。');
  alignCircuitRows(source.networks, target.networks);
  compareConnections(source.networks, target.networks);
  source.comparison = {
    target,
    sourceProject: metadata('照合元プロジェクト') || metadata('照合元'),
    targetProject: metadata('照合先プロジェクト') || metadata('照合先'),
    sourceName: metadata('照合元データ名') || legacyDataName('照合元'),
    targetName: metadata('照合先データ名') || legacyDataName('照合先'),
    rowCount: rows.length,
    differentRows: changes.length,
    changes,
    shiftedSteps,
  };
  return source;
}

// Networks sharing aligned instruction ranges stay together; original CSV rows remain source locations.
export function pairNetworks(
  source: Network[],
  target: Network[],
): { source: Network[]; target: Network[] }[] {
  const entries = [
    ...source.map((network) => ({ network, side: 'source' as const })),
    ...target.map((network) => ({ network, side: 'target' as const })),
  ]
    .map((entry) => ({
      ...entry,
      start: Math.min(...entry.network.instructions.map((i) => i.comparisonRow ?? i.sourceRow)),
      end: Math.max(...entry.network.instructions.map((i) => i.comparisonRow ?? i.sourceRow)),
    }))
    .sort((a, b) => a.start - b.start);
  const groups: { source: Network[]; target: Network[] }[] = [];
  let end = -1;
  for (const entry of entries) {
    if (entry.start > end) {
      groups.push({ source: [], target: [] });
      end = entry.end;
    } else end = Math.max(end, entry.end);
    groups.at(-1)![entry.side].push(entry.network);
  }
  return groups;
}

export function comparisonGroups(
  source: Network[],
  comparison: NonNullable<Program['comparison']>,
) {
  const groups = pairNetworks(source, comparison.target.networks);
  let previousEnd = -1;
  return groups.map((group, index) => {
    const end =
      index === groups.length - 1
        ? Infinity
        : [...group.source, ...group.target].reduce(
            (end, n) =>
              n.instructions.reduce((end, i) => Math.max(end, i.comparisonRow ?? i.sourceRow), end),
            previousEnd,
          );
    const changes = comparison.changes.filter((change) => {
      const row = change.noteOwnerRow ?? change.alignmentRow;
      return row > previousEnd && row <= end;
    });
    previousEnd = end;
    return { ...group, changes };
  });
}

export function alignCircuitRows(source: Network[], target: Network[]) {
  for (const group of pairNetworks(source, target)) {
    if (
      group.source.length === 1 &&
      group.target.length === 1 &&
      !group.source[0].functionBlock &&
      !group.target[0].functionBlock
    ) {
      const networks = [group.source[0], group.target[0]];
      const { drawings, hints } = alignBranches(networks.map((n) => (rows) => layoutGrid(n, rows)));
      networks.forEach((n, side) => {
        n.branchRowAlignment = Object.keys(hints[side]).length ? hints[side] : undefined;
        n.rowAlignment = Array.from({ length: drawings[side].rows }, (_, row) => row);
      });
      const padding = Math.max(...networks.map((n) => drawingMetrics(n, ROW).padding));
      for (const n of networks) n.comparisonNotePadding = padding;
      const pages = drawings.map((d) => drawingPages(d)),
        count = Math.min(...pages.map((p) => p.length));
      if (count > 1)
        for (const n of networks)
          n.comparisonPageRows = Array.from({ length: count }, (_, page) =>
            Math.max(...pages.map((p) => p[page].rows)),
          );
      continue;
    }
    const descriptors = (networks: Network[]) =>
      networks.flatMap((network) => {
        const grid = gridLayout(network);
        return Array.from({ length: grid.rows }, (_, row) => ({
          network,
          row,
          key: Math.max(
            0,
            ...grid.symbols
              .filter((s) => s.row === row)
              .map((s) => s.instruction.comparisonRow ?? 0),
          ),
        }));
      });
    const a = descriptors(group.source),
      b = descriptors(group.target);
    const changes = diffArrays(
      a.map((r) => r.key),
      b.map((r) => r.key),
    );
    const positionsA: number[] = [],
      positionsB: number[] = [];
    let slot = 0;
    for (let index = 0; index < changes.length; index++) {
      const part = changes[index];
      if (!part.added && !part.removed) {
        for (let i = 0; i < part.count; i++) {
          positionsA.push(slot);
          positionsB.push(slot++);
        }
        continue;
      }
      let removed = 0,
        added = 0;
      while (index < changes.length && (changes[index].added || changes[index].removed)) {
        if (changes[index].removed) removed += changes[index].count;
        else added += changes[index].count;
        index++;
      }
      index--;
      for (let i = 0; i < removed; i++) positionsA.push(slot + i);
      for (let i = 0; i < added; i++) positionsB.push(slot + i);
      slot += Math.max(removed, added);
    }
    const networks = [...group.source, ...group.target];
    const notePadding = Math.max(
      0,
      ...networks.map((network) => drawingMetrics(network, ROW).padding),
    );
    for (const network of networks) network.comparisonNotePadding = notePadding;
    for (const [rows, positions] of [
      [a, positionsA],
      [b, positionsB],
    ] as const) {
      let start = 0,
        previous: Network | undefined;
      rows.forEach((descriptor, index) => {
        if (previous && previous !== descriptor.network) start = positions[index - 1] + 1;
        (descriptor.network.rowAlignment ??= [])[descriptor.row] = positions[index] - start;
        previous = descriptor.network;
      });
    }
    if (group.source.length === 1 && group.target.length === 1) {
      const pages = [group.source[0], group.target[0]].map((network) =>
        drawingPages(gridLayout(network)),
      );
      const sharedPages = Math.min(pages[0].length, pages[1].length);
      if (sharedPages > 1) {
        const rows = Array.from({ length: sharedPages }, (_, index) =>
          Math.max(pages[0][index].rows, pages[1][index].rows),
        );
        for (const network of networks) network.comparisonPageRows = rows;
      }
    }
  }
}
