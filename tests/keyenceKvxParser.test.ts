import { requireValue } from '../src/requireValue';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKeyenceMnm } from '../src/keyence/parser.ts';

// Original dummy text only; tests never read the supplied MNM/PDF files.
const parse = (lines: string[], device = '60') =>
  parseKeyenceMnm(
    new TextEncoder().encode(
      [`DEVICE:${device}`, ';MODULE:DummyKvx', ';MODULE_TYPE:0', ...lines].join('\r\n'),
    ).buffer,
    'dummy-kvx.mnm',
  );

test('AREA_ST keeps source rows, tabs, blank lines and literal markup on its instruction', () => {
  const body = [
    ';// <h2/> remains ST text',
    ';IF xDummyReady THEN',
    ";\tsDummyText := 'part;one';",
    ';',
    ';\t// preserve inner semicolons; and trailing spaces  ',
    ';END_IF;',
    '',
    '  \t',
  ];
  const p = parse([';Dummy circuit heading', 'AREA_ST', ...body, 'END', 'ENDH']);
  assert.equal(p.deviceCode, '60');
  assert.equal(p.moduleName, 'DummyKvx');
  assert.deepEqual(
    p.instructions.map((i) => i.opcode),
    ['AREA_ST', 'END', 'ENDH'],
  );
  const instruction = requireValue(p.instructions[0]);
  assert.equal(instruction.raw, 'AREA_ST');
  assert.equal(instruction.sourceLine, 5);
  assert.equal(instruction.sourceEndLine, 5 + body.length);
  assert.equal(instruction.statement, 'Dummy circuit heading');
  assert.deepEqual(
    instruction.st?.lines,
    body.map((raw, index) => ({
      sourceLine: index + 6,
      raw,
      text: raw.startsWith(';') ? raw.slice(1) : raw,
    })),
  );
  assert.deepEqual(p.comments, [{ sourceLine: 4, text: 'Dummy circuit heading' }]);
  assert.equal(requireValue(p.instructions[1]).statement, '');
  assert.ok(
    p.text.includes(body.join('\r\n')),
    'the original line endings remain in the program text',
  );
});

test('ST ends at the next MNM instruction and multiple ST sections retain their own rows', () => {
  const p = parse([
    'AREA_ST',
    ';uiDummy := 73;',
    'LD R9700',
    ';ordinary comment',
    'OUT MR9701',
    'AREA_ST',
    ';\tuiDummy := 91;',
  ]);
  assert.deepEqual(
    p.instructions.map((i) => i.opcode),
    ['AREA_ST', 'LD', 'OUT', 'AREA_ST'],
  );
  assert.deepEqual(
    requireValue(p.instructions[0]).st?.lines.map((line) => line.text),
    ['uiDummy := 73;'],
  );
  assert.equal(requireValue(p.instructions[2]).statement, 'ordinary comment');
  assert.deepEqual(
    requireValue(p.instructions[3]).st?.lines.map((line) => line.text),
    ['\tuiDummy := 91;'],
  );
  assert.deepEqual(p.comments, [{ sourceLine: 7, text: 'ordinary comment' }]);
});

test('ST source that resembles MNM metadata is never reclassified or stripped', () => {
  const p = parse([
    'AREA_ST',
    ';MODULE:DummySourceLiteral',
    ';MODULE_TYPE:9',
    ';END',
    ';AREA_ST',
    'END',
  ]);
  assert.equal(p.moduleName, 'DummyKvx');
  assert.equal(p.moduleType, '0');
  assert.equal(p.metadata.length, 3);
  assert.deepEqual(p.comments, []);
  assert.deepEqual(
    requireValue(p.instructions[0]).st?.lines.map((line) => line.text),
    ['MODULE:DummySourceLiteral', 'MODULE_TYPE:9', 'END', 'AREA_ST'],
  );
  assert.equal(p.instructions.at(-1)?.opcode, 'END');
});

test('UTF-16 ST decoding retains Unicode source and the exact encoded source lines', () => {
  const text = "DEVICE:60\r\nAREA_ST\r\n;\t架空文字列 := 'テスト;値';\r\n;\r\nEND\r\nENDH\r\n";
  const bytes = Buffer.from('\uFEFF' + text, 'utf16le');
  const p = parseKeyenceMnm(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    'dummy-unicode.mnm',
  );
  assert.equal(p.text, text);
  assert.deepEqual(requireValue(p.instructions[0]).st?.lines, [
    { sourceLine: 3, raw: ";\t架空文字列 := 'テスト;値';", text: "\t架空文字列 := 'テスト;値';" },
    { sourceLine: 4, raw: ';', text: '' },
  ]);
});

test('FBEXEC and FBEAND separate block type, instance and unchanged argument indices', () => {
  for (const opcode of ['FBEXEC', 'FBEAND']) {
    const raw = `${opcode} DummyGate dummyGateInstance TRUE T#3.7s ??? 'a; b' ; dummy inline note`;
    const p = parse([raw]),
      instruction = requireValue(p.instructions[0]);
    assert.equal(instruction.opcode, opcode);
    assert.equal(instruction.raw, raw);
    assert.equal(instruction.comment, 'dummy inline note');
    assert.deepEqual(instruction.operands, [
      'DummyGate',
      'dummyGateInstance',
      'TRUE',
      'T#3.7s',
      '???',
      "'a; b'",
    ]);
    assert.deepEqual(instruction.fb, {
      name: 'DummyGate',
      instance: 'dummyGateInstance',
      instanceOperandIndex: 1,
      pins: ['TRUE', 'T#3.7s', '???', "'a; b'"].map((value, index) => ({
        name: '引数' + (index + 1),
        value,
        operandIndex: index + 2,
      })),
    });
  }
});

test('unknown FUN, FUNLD and FUNAND keep every argument without guessing names or directions', () => {
  for (const opcode of ['FUN', 'FUNLD', 'FUNAND']) {
    const i = requireValue(
      parse([`${opcode} DummyTransform mockResult mockSource[7] #53`]).instructions[0],
    );
    assert.deepEqual(i.fb, {
      name: 'DummyTransform',
      pins: [
        { name: '引数1', value: 'mockResult', operandIndex: 1 },
        { name: '引数2', value: 'mockSource[7]', operandIndex: 2 },
        { name: '引数3', value: '#53', operandIndex: 3 },
      ],
    });
  }
});

test('legacy KV-8000 FB and FUN models retain generic arguments and ordinary comments', () => {
  for (const opcode of ['FB', 'FUN']) {
    const p = parse(
      [';Dummy legacy heading', `${opcode} DummyLegacy DM9760 #61 DM9762`, ';Dummy footer', 'END'],
      '99',
    );
    assert.deepEqual(requireValue(p.instructions[0]).fb, {
      name: 'DummyLegacy',
      pins: [
        { name: '引数1', value: 'DM9760', operandIndex: 1 },
        { name: '引数2', value: '#61', operandIndex: 2 },
        { name: '引数3', value: 'DM9762', operandIndex: 3 },
      ],
    });
    assert.equal(requireValue(p.instructions[0]).statement, 'Dummy legacy heading');
    assert.equal(requireValue(p.instructions[1]).statement, 'Dummy footer');
    assert.ok(p.instructions.every((i) => i.st === undefined));
  }
});

test('bookmark and rung-comment text belongs to the marker rather than the following circuit', () => {
  for (const opcode of ['BOOKMARK', 'RUNG_COMMENT']) {
    const p = parse([
      ';Dummy heading',
      opcode,
      ';First dummy annotation',
      ';',
      ';Second dummy annotation',
      'LD R9780',
      'OUT MR9781',
    ]);
    assert.equal(
      requireValue(p.instructions[0]).statement,
      'Dummy heading\nFirst dummy annotation\n\nSecond dummy annotation',
    );
    assert.equal(requireValue(p.instructions[0]).raw, opcode);
    assert.equal(requireValue(p.instructions[0]).sourceEndLine, 8);
    assert.equal(requireValue(p.instructions[1]).statement, '');
    assert.equal(requireValue(p.instructions[2]).statement, '');
    assert.deepEqual(
      p.comments.map((c) => c.sourceLine),
      [4, 6, 7, 8],
    );
    assert.deepEqual(
      p.instructions.map((i) => i.opcode),
      [opcode, 'LD', 'OUT'],
    );
  }
});

test('known function pins retain their declared direction rather than treating every first argument as output', () => {
  const p = parse([
    'FUN TimeToMilliSec dummyMilliseconds dummyElapsed',
    'FUN MOVE dummySource dummyDestination',
    'FUN DisableInterruptRange dummyStatus',
  ]);
  assert.deepEqual(
    p.instructions.map((i) => i.fb?.pins.map((pin) => [pin.name, pin.direction, pin.operandIndex])),
    [
      [
        ['Result', 'output', 1],
        ['In', 'input', 2],
      ],
      [
        ['Src', 'input', 1],
        ['Dst', 'output', 2],
      ],
      [['Dst', 'output', 1]],
    ],
  );
  assert.ok(
    p.instructions.every(
      (i) => i.fb?.knownSignature && i.fb.powerInput === 'EN' && i.fb.powerOutput === 'ENO',
    ),
  );
  assert.deepEqual(
    requireValue(p.instructions[1]).fb?.pins.map((pin) => pin.value),
    ['dummySource', 'dummyDestination'],
  );
});

test('FIFO input-output pins keep distinct left and right row positions', () => {
  const fb = requireValue(
    parse(['FUN FIFORead dummyTable #29 dummyCount dummyItem']).instructions[0],
  ).fb!;
  assert.equal(fb.knownSignature, true);
  assert.deepEqual(
    fb.pins.map((pin) => [pin.name, pin.direction, pin.operandIndex, pin.inputRow, pin.outputRow]),
    [
      ['Table', 'inout', 1, 0, 0],
      ['MaxDataNum', 'input', 2, 1, undefined],
      ['DataNum', 'inout', 3, 2, 2],
      ['Dst', 'output', 4, undefined, 1],
    ],
  );
});

test('known blocks preserve instances and unassigned placeholders while adding declared pin positions', () => {
  const timer = requireValue(parse(['FBEAND TON dummyTimer T#3.7s ???']).instructions[0]);
  assert.equal(timer.fb?.instance, 'dummyTimer');
  assert.equal(timer.fb?.instanceOperandIndex, 1);
  assert.equal(timer.fb?.powerInput, 'In');
  assert.equal(timer.fb?.powerOutput, 'Q');
  assert.deepEqual(
    timer.fb?.pins.map((pin) => [pin.name, pin.value, pin.direction, pin.operandIndex]),
    [
      ['PT', 'T#3.7s', 'input', 2],
      ['ET', '???', 'output', 3],
    ],
  );
  const sort = requireValue(
    parse([
      "FBEAND StructSort dummySort dummyArray #29 TRUE 'DummyField' ??? dummyBusy dummyError dummyErrorCode",
    ]).instructions[0],
  );
  assert.equal(sort.fb?.knownSignature, true);
  assert.equal(
    sort.fb?.pins.find((pin) => pin.name === 'ProcTime')?.value,
    '???',
    'a placeholder must never be replaced with a guessed default',
  );
  assert.equal(sort.operands[6], '???');
  const recv = requireValue(
    parse([
      'FBEXEC SocketUDP_Recv dummyReceiver #29 #73 dummyBuffer T#3.7s dummyReceived dummyPeer dummyPort dummyBusy dummyError dummyErrorCode',
    ]).instructions[0],
  ).fb!;
  assert.equal(recv.knownSignature, true);
  assert.equal(recv.instance, 'dummyReceiver');
  assert.deepEqual(
    recv.pins.filter((pin) => pin.outputRow !== undefined).map((pin) => [pin.name, pin.outputRow]),
    [
      ['Dst', 2],
      ['RecvByteSize', 0],
      ['SrcAddress', 1],
      ['SrcPortNo', 3],
      ['Busy', 4],
      ['Error', 5],
      ['ErrorID', 6],
    ],
  );
});

test('implicit function power pins distinguish load, boolean AND and zero-argument calls', () => {
  const p = parse([
    'FUNLD DegToRad dummyRadians dummyDegrees',
    'FUNAND EQ dummyLeft dummyRight',
    'FUN RefreshFreerunCounter',
  ]);
  assert.deepEqual(
    p.instructions.map((i) => [i.fb?.knownSignature, i.fb?.powerInput, i.fb?.powerOutput]),
    [
      [true, null, 'ENO'],
      [true, 'EN', 'Result'],
      [true, 'EN', 'ENO'],
    ],
  );
  assert.deepEqual(requireValue(p.instructions[2]).fb?.pins, []);
});

test('constant IN-OUT declarations keep their formal direction and only the left pin row', () => {
  const declarations: [string, string[]][] = [
    ['U_SockOpen', ['Unit', 'Socket', 'Setting']],
    ['U_SockNonProcRecvSetting', ['Unit', 'Socket', 'Setting']],
    ['U_SockWriteBuf', ['Unit', 'Socket', 'SendData']],
    ['U_CyclicStop', ['Unit', 'In']],
    ['U_CyclicStart', ['Unit', 'In']],
    ['U_MsgTo', ['Unit', 'Setting']],
    ['U_MsgSend', ['Unit', 'SendData']],
  ];
  for (const [name, names] of declarations) {
    const values = names.map((_, index) => `dummyArgument${index + 1}`);
    const fb = requireValue(parse([`FUN ${name} ${values.join(' ')}`]).instructions[0]).fb!;
    assert.equal(fb.knownSignature, true, name);
    assert.equal(fb.powerInput, 'EN');
    assert.equal(fb.powerOutput, 'ENO');
    assert.deepEqual(
      fb.pins.map((pin) => pin.name),
      names,
      name,
    );
    assert.deepEqual(
      fb.pins.map((pin) => pin.value),
      values,
    );
    assert.deepEqual(
      fb.pins.map((pin) => pin.operandIndex),
      values.map((_, index) => index + 1),
    );
    assert.ok(
      fb.pins.slice(0, -1).every((pin) => pin.direction === 'input' && pin.constant === undefined),
    );
    const pin = fb.pins.at(-1)!;
    assert.equal(pin.direction, 'inout');
    assert.equal(pin.constant, true);
    assert.equal(pin.inputRow, names.length - 1);
    assert.equal(pin.outputRow, undefined);
  }
});

test('receive and refresh declarations put writable IN-OUT values on both sides', () => {
  const cases: [string, string[], number][] = [
    ['U_SockStatus', ['Unit', 'Socket', 'Dst'], 2],
    ['U_SockReadBuf', ['Unit', 'Socket', 'Dst'], 2],
    ['U_MsgRecv', ['Unit', 'Dst'], 1],
    ['U_MsgStatus', ['Unit', 'Dst'], 1],
    ['RefreshX', ['InRelay', 'BitSize'], 0],
    ['RefreshY', ['OutRelay', 'BitSize'], 0],
  ];
  for (const [name, names, inoutRow] of cases) {
    const values = names.map((_, index) => `dummyValue${index + 1}`);
    const fb = requireValue(parse([`FUN ${name} ${values.join(' ')}`]).instructions[0]).fb!;
    assert.equal(fb.knownSignature, true, name);
    assert.equal(fb.powerOutput, 'ENO');
    assert.deepEqual(
      fb.pins.map((pin) => pin.name),
      names,
    );
    assert.deepEqual(
      fb.pins.map((pin) => pin.value),
      values,
    );
    assert.deepEqual(
      fb.pins.map((pin) => pin.operandIndex),
      values.map((_, index) => index + 1),
    );
    assert.deepEqual(
      fb.pins.map((pin) => pin.inputRow),
      names.map((_, index) => index),
    );
    const pin = requireValue(fb.pins[inoutRow]);
    assert.equal(pin.direction, 'inout');
    assert.equal(pin.outputRow, inoutRow);
    assert.equal(pin.constant, undefined);
    assert.ok(
      fb.pins
        .filter((_, index) => index !== inoutRow)
        .every((pin) => pin.direction === 'input' && pin.outputRow === undefined),
    );
  }
});

test('port, cyclic refresh and string transfer calls retain their distinct parameter contracts', () => {
  const p = parse([
    'FUN U_SockSelectPort dummyUnit dummySocket dummyPort',
    'FUN RefreshCyclicOutput dummyUnit dummyNode dummyConnection',
    "FUN StringMove 'Invented test payload' dummyTextDestination",
  ]);
  assert.deepEqual(
    p.instructions.map((i) =>
      i.fb?.pins.map((pin) => [pin.name, pin.direction, pin.inputRow, pin.outputRow]),
    ),
    [
      [
        ['Unit', 'input', 0, undefined],
        ['Socket', 'input', 1, undefined],
        ['Port', 'input', 2, undefined],
      ],
      [
        ['Unit', 'input', 0, undefined],
        ['NodeAdr', 'input', 1, undefined],
        ['Connection', 'input', 2, undefined],
      ],
      [
        ['Src', 'input', 0, undefined],
        ['Dst', 'output', undefined, 0],
      ],
    ],
  );
  assert.equal(requireValue(p.instructions[2]).fb?.pins[0]?.value, "'Invented test payload'");
  assert.ok(
    p.instructions.every(
      (i) => i.fb?.knownSignature && i.fb.powerInput === 'EN' && i.fb.powerOutput === 'ENO',
    ),
  );
});

test('recognized placement variants share the declaration without inventing a Result output', () => {
  for (const opcode of ['FUN', 'FUNLD', 'FUNAND']) {
    const p = parse([
      `${opcode} UnitBufMemWrite dummyUnit #73 dummyWord`,
      `${opcode} EQ dummyLeft dummyRight`,
    ]);
    assert.ok(p.instructions.every((i) => i.fb?.knownSignature));
    assert.deepEqual(
      p.instructions.map((i) => i.fb?.powerInput),
      [opcode === 'FUNLD' ? null : 'EN', opcode === 'FUNLD' ? null : 'EN'],
    );
    assert.deepEqual(
      p.instructions.map((i) => i.fb?.powerOutput),
      ['ENO', 'Result'],
    );
    assert.deepEqual(
      requireValue(p.instructions[0]).fb?.pins.map((pin) => [
        pin.name,
        pin.value,
        pin.operandIndex,
      ]),
      [
        ['Unit', 'dummyUnit', 1],
        ['BufMemAddress', '#73', 2],
        ['Src', 'dummyWord', 3],
      ],
    );
    assert.deepEqual(
      requireValue(p.instructions[1]).fb?.pins.map((pin) => pin.name),
      ['In1', 'In2'],
    );
  }
  for (const opcode of ['FBEXEC', 'FBEAND']) {
    const fb = requireValue(
      parse([`${opcode} TON dummyTimer T#3.7s dummyElapsed`]).instructions[0],
    ).fb!;
    assert.equal(fb.knownSignature, true);
    assert.equal(fb.instance, 'dummyTimer');
    assert.equal(fb.powerInput, 'In');
    assert.equal(fb.powerOutput, 'Q');
    assert.deepEqual(
      fb.pins.map((pin) => [pin.name, pin.operandIndex]),
      [
        ['PT', 2],
        ['ET', 3],
      ],
    );
  }
});

test('signature mismatches and older device codes preserve generic names and all original values', () => {
  const cases = [
    parse(['FUN MOVE dummyOne dummyTwo dummyExtra']),
    parse(['FBEXEC TON dummyTimer T#3.7s ??? dummyExtra']),
    parse(['FUN U_SockOpen dummyUnit dummySocket']),
    parse(['FUN MOVE dummyOne dummyTwo'], '99'),
  ];
  for (const p of cases) {
    const i = requireValue(p.instructions[0]),
      start = i.opcode === 'FBEXEC' ? 2 : 1;
    assert.equal(i.fb?.knownSignature, undefined);
    assert.deepEqual(
      i.fb?.pins.map((pin) => pin.value),
      i.operands.slice(start),
    );
    assert.ok(
      i.fb?.pins.every(
        (pin, index) => pin.name === '引数' + (index + 1) && pin.direction === undefined,
      ),
    );
  }
});
