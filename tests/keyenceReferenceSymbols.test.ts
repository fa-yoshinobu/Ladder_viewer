import { requireValue } from '../src/requireValue';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKeyenceMnm } from '../src/keyence/parser.ts';
import { keyenceOutputStyle, keyenceNumberedDevice } from '../src/keyence/outputStyle.ts';
import { KeyenceNativeSymbol } from '../src/keyence/nativeSymbols.tsx';
import { strokeCoordinates } from '../src/drawing.ts';
import { CELL } from '../src/ladderMetrics.ts';
import type { KeyenceSymbol } from '../src/keyence/layout.ts';

// Original dummy instructions; none of the supplied programs are test fixtures.
const instruction = (text: string) =>
  parseKeyenceMnm(new TextEncoder().encode('DEVICE:99\n' + text).buffer, 'synthetic.mnm')
    .instructions[0];
const symbol = (text: string, extra: Partial<KeyenceSymbol> = {}): KeyenceSymbol => {
  const i = instruction(text),
    s = keyenceOutputStyle(requireValue(i));
  return {
    instruction: requireValue(i),
    x: 100,
    y: 40,
    width: (s.columns ?? 1) * CELL,
    kind: s.kind,
    negated: false,
    pulse: null,
    label: text,
    comment: '',
    commentLines: [],
    ...extra,
  };
};
type Node = { type: string; props: Record<string, any> };
function rendered(value: any): Node[] {
  if (value == null || typeof value === 'boolean') return [];
  if (Array.isArray(value)) return value.flatMap(rendered);
  if (typeof value !== 'object') return [];
  if (typeof value.type === 'function') return rendered(value.type(value.props));
  return [...(typeof value.type === 'string' ? [value] : []), ...rendered(value.props?.children)];
}
function textContent(value: any): string {
  if (value == null || typeof value === 'boolean') return '';
  if (Array.isArray(value)) return value.map(textContent).join('');
  if (typeof value !== 'object') return String(value);
  return textContent(
    typeof value.type === 'function' ? value.type(value.props) : value.props?.children,
  );
}
const draw = (s: KeyenceSymbol) =>
  rendered(KeyenceNativeSymbol({ symbol: s, c: strokeCoordinates(1, 1, 0, 0) }));
const texts = (s: KeyenceSymbol) =>
  draw(s)
    .filter((n) => n.type === 'text')
    .map((n) => ({ text: textContent(n), x: n.props.x, y: n.props.y }));

test('KEYENCE reference symbol families keep operation, operands and native box spans', () => {
  const cases: [string, string, number?][] = [
    ['@SET MR1', 'labeled-coil'],
    ['@BRES.D DM10 #2', 'labeled-coil'],
    ['BOUB.D DM10 #2', 'bit-coil'],
    ['TMH #3 #40', 'timer'],
    ['TMU #4 #50', 'timer'],
    ['C #5 #60 MR2', 'timer'],
    ['OUTC #6 #70', 'counter'],
    ['ONDL #2 MR3', 'labeled-coil'],
    ['W-ON MR1 MR2', 'wait'],
    ['W-UE MR1 MR2', 'wait'],
    ['STG MR1', 'stage'],
    ['JMP MR1', 'jump'],
    ['ENDS', 'jump'],
    ['@ADD.DF DM10', 'calculation'],
    ['ATAN2.DF DM10 DM20', 'calculation'],
    ['AVG.F DM10 DM20', 'application'],
    ['CALL #7', 'application'],
    ['HKEY MR1 MR2', 'command', 1],
    ['@MOV.D DM10 DM20', 'command', 2],
    ['@BMOV DM10 DM20 #3', 'command', 3],
    ['@APR.DF DM10 DM20 DM30 #4', 'command', 4],
    ['CAL+.S DM10 +2 DM20', 'command', 4],
    ['MCALL ExampleMacro', 'command', 3],
    ['KEEP MR1', 'keep'],
    ['SFT MR1 MR2', 'multi-input'],
    ['UDT #1 #90', 'multi-input'],
    ['ITVL.S DM10 DM20', 'multi-input'],
    ['PID DM10 DM20', 'multi-input'],
  ];
  for (const [text, kind, columns] of cases) {
    const i = instruction(text),
      s = keyenceOutputStyle(requireValue(i));
    assert.equal(s.kind, kind, text);
    assert.equal(s.columns, columns, text);
    const visible = texts(symbol(text))
      .map((t) => t.text)
      .join(' ');
    for (const operand of requireValue(i).operands)
      assert.ok(
        visible.includes(operand) || s.bodyOperand === requireValue(i).operands.indexOf(operand),
        `${text}: ${operand}`,
      );
  }
  assert.equal(keyenceNumberedDevice(requireValue(instruction('TMU #4 #50'))), 'T4');
  assert.equal(keyenceNumberedDevice(requireValue(instruction('C #5 #60 MR2'))), 'C5');
});

test('native boxes render all operands across columns and a second row without losing their order', () => {
  const s = symbol('MWRIT DM10 DM20 DM30 DM40 DM50'),
    fields = texts(s).filter((t) => t.text.startsWith('DM'));
  assert.deepEqual(
    fields.map((t) => t.text),
    ['DM10', 'DM20', 'DM30', 'DM40', 'DM50'],
  );
  assert.equal(requireValue(fields[0]).y, requireValue(fields[2]).y);
  assert.ok(
    requireValue(fields[0]).x < requireValue(fields[1]).x &&
      requireValue(fields[1]).x < requireValue(fields[2]).x,
  );
  assert.equal(requireValue(fields[0]).x, requireValue(fields[3]).x);
  assert.equal(requireValue(fields[1]).x, requireValue(fields[4]).x);
  assert.ok(requireValue(fields[3]).y > requireValue(fields[0]).y);
  const calculation = texts(symbol('CAL+.S DM10 +2 DM20'));
  assert.deepEqual(
    calculation.map((t) => t.text),
    ['+.S', 'DM10', '+2', 'DM20'],
  );
  assert.ok(
    calculation.every((t, index) => index === 0 || t.x > requireValue(calculation[index - 1]).x),
  );
  const control = texts(symbol('MC', { controlLevel: 7 }));
  assert.equal(requireValue(control[0]).text, 'MC 7');
});

test('native SVG includes execution arrows, negation and each independently wired input', () => {
  assert.ok(
    draw(symbol('@MOV DM10 DM20')).some((n) => n.props.class === 'contact kv-execution-pulse'),
  );
  assert.ok(
    !draw(symbol('MOV DM10 DM20')).some((n) => n.props.class === 'contact kv-execution-pulse'),
  );
  for (const text of ['OUB MR1', 'BOUB.D DM10 #2'])
    assert.ok(
      draw(symbol(text)).some((n) => n.props.class === 'contact kv-negated'),
      text,
    );
  const s = symbol('SFT MR1 MR2', {
      ports: [
        { name: 'D', y: 40 },
        { name: 'CLK', y: 96, difference: 'added' },
        { name: 'RES', y: 152 },
      ],
    }),
    nodes = draw(s);
  for (const port of s.ports!) {
    assert.ok(
      nodes.some(
        (n) => n.type === 'text' && textContent(n) === port.name && n.props.y === port.y + 4,
      ),
    );
    assert.ok(
      nodes.some(
        (n) =>
          n.type === 'line' &&
          n.props.x1 === 100.5 &&
          n.props.y1 === port.y + 0.5 &&
          n.props.y2 === port.y + 0.5,
      ),
    );
  }
  assert.ok(nodes.some((n) => n.type === 'line' && n.props.class === 'wire wire-added'));
  assert.deepEqual(
    texts(s)
      .filter((t) => t.text.startsWith('MR'))
      .map((t) => t.text),
    ['MR1', 'MR2'],
  );
});

test('comparisons render both operands above and below the operator and highlight only the changed field', () => {
  const s = symbol('LDB= DM10 #2', {
    kind: 'comparison',
    label: '= DM10 #2',
    negated: true,
    width: CELL * 3,
  });
  s.instruction.difference = {
    kind: 'changed',
    opChanged: false,
    operandChanges: [1],
    otherText: 'LDB= DM10 #3',
  };
  const fields = texts(s);
  assert.deepEqual(
    fields.map((t) => t.text),
    ['=', 'DM10', '#2'],
  );
  assert.ok(requireValue(fields[1]).y < s.y && requireValue(fields[2]).y > s.y);
  assert.deepEqual(
    draw(s)
      .filter((n) => n.type === 'tspan' && n.props.class === 'diff-value')
      .map(textContent),
    ['#2'],
  );
  assert.ok(draw(s).some((n) => n.props.class === 'contact kv-negated'));
});
