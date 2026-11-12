import type { KeyenceFb } from './model';

type Pin = [name: string, inputRow: number | null, outputRow: number | null, constant?: true];
type Signature = [
  name: string,
  opcode: string,
  powerInput: string,
  powerOutput: string,
  pins: Pin[],
];
// Confirmed KV-X function declarations only: no program values, variables or source text.
// Pin rows exclude the implicit power input/output row; null means no pin on that side.
// Constant IN-OUT arguments are declared as IN-OUT but appear only on the left.
const signatures: Signature[] = [
  [
    'TimeToMilliSec',
    'FUN',
    'EN',
    'ENO',
    [
      ['Result', null, 0],
      ['In', 0, null],
    ],
  ],
  [
    'AryShiftL',
    'FUN',
    'EN',
    'ENO',
    [
      ['InOut', 0, 0],
      ['Count', 1, null],
      ['ShiftNum', 2, null],
    ],
  ],
  [
    'AryShiftR',
    'FUN',
    'EN',
    'ENO',
    [
      ['InOut', 0, 0],
      ['Count', 1, null],
      ['ShiftNum', 2, null],
    ],
  ],
  [
    'DegToRad',
    'FUNLD',
    'EN',
    'ENO',
    [
      ['Result', null, 0],
      ['Deg', 0, null],
    ],
  ],
  [
    'SIN',
    'FUN',
    'EN',
    'ENO',
    [
      ['Result', null, 0],
      ['In', 0, null],
    ],
  ],
  [
    'COS',
    'FUN',
    'EN',
    'ENO',
    [
      ['Result', null, 0],
      ['In', 0, null],
    ],
  ],
  [
    'TAN',
    'FUN',
    'EN',
    'ENO',
    [
      ['Result', null, 0],
      ['In', 0, null],
    ],
  ],
  [
    'ASIN',
    'FUNLD',
    'EN',
    'ENO',
    [
      ['Result', null, 0],
      ['In', 0, null],
    ],
  ],
  [
    'ACOS',
    'FUNLD',
    'EN',
    'ENO',
    [
      ['Result', null, 0],
      ['In', 0, null],
    ],
  ],
  [
    'ATAN',
    'FUNLD',
    'EN',
    'ENO',
    [
      ['Result', null, 0],
      ['In', 0, null],
    ],
  ],
  [
    'RadToDeg',
    'FUN',
    'EN',
    'ENO',
    [
      ['Result', null, 0],
      ['Rad', 0, null],
    ],
  ],
  [
    'GetAryCount',
    'FUN',
    'EN',
    'ENO',
    [
      ['Result', null, 0],
      ['In', 0, null],
      ['Dim', 1, null],
    ],
  ],
  [
    'ArySum',
    'FUN',
    'EN',
    'ENO',
    [
      ['Result', null, 0],
      ['Src', 0, null],
      ['Count', 1, null],
    ],
  ],
  [
    'UDINT_TO_REAL',
    'FUN',
    'EN',
    'ENO',
    [
      ['Result', null, 0],
      ['In', 0, null],
    ],
  ],
  [
    'DIV',
    'FUN',
    'EN',
    'ENO',
    [
      ['Result', null, 0],
      ['In1', 0, null],
      ['In2', 1, null],
    ],
  ],
  [
    'EQ',
    'FUNAND',
    'EN',
    'Result',
    [
      ['In1', 0, null],
      ['In2', 1, null],
    ],
  ],
  [
    'LT',
    'FUNAND',
    'EN',
    'Result',
    [
      ['In1', 0, null],
      ['In2', 1, null],
    ],
  ],
  [
    'FIFORead',
    'FUN',
    'EN',
    'ENO',
    [
      ['Table', 0, 0],
      ['MaxDataNum', 1, null],
      ['DataNum', 2, 2],
      ['Dst', null, 1],
    ],
  ],
  [
    'FIFOWrite',
    'FUN',
    'EN',
    'ENO',
    [
      ['In', 0, null],
      ['MaxDataNum', 1, null],
      ['DataNum', 2, 2],
      ['Table', 3, 3],
    ],
  ],
  [
    'FIFOInsert',
    'FUN',
    'EN',
    'ENO',
    [
      ['In', 0, null],
      ['MaxDataNum', 1, null],
      ['DataNum', 2, 2],
      ['Table', 3, 3],
      ['Pos', 4, null],
    ],
  ],
  [
    'FIFODelete',
    'FUN',
    'EN',
    'ENO',
    [
      ['Table', 0, 0],
      ['MaxDataNum', 1, null],
      ['DataNum', 2, 2],
      ['Pos', 3, null],
    ],
  ],
  [
    'MOVE',
    'FUN',
    'EN',
    'ENO',
    [
      ['Src', 0, null],
      ['Dst', null, 0],
    ],
  ],
  [
    'UnitBufMemBlockRead',
    'FUN',
    'EN',
    'ENO',
    [
      ['Unit', 0, null],
      ['BufMemAddress', 1, null],
      ['Dst', 2, 2],
      ['WordSize', 3, null],
    ],
  ],
  [
    'UnitBufMemBlockWrite',
    'FUN',
    'EN',
    'ENO',
    [
      ['Unit', 0, null],
      ['BufMemAddress', 1, null],
      ['Src', 2, null],
      ['WordSize', 3, null],
    ],
  ],
  [
    'UnitBufMemRead',
    'FUN',
    'EN',
    'ENO',
    [
      ['Unit', 0, null],
      ['BufMemAddress', 1, null],
      ['Dst', 2, 2],
    ],
  ],
  [
    'UnitBufMemWrite',
    'FUN',
    'EN',
    'ENO',
    [
      ['Unit', 0, null],
      ['BufMemAddress', 1, null],
      ['Src', 2, null],
    ],
  ],
  [
    'U_SockOpen',
    'FUN',
    'EN',
    'ENO',
    [
      ['Unit', 0, null],
      ['Socket', 1, null],
      ['Setting', 2, null, true],
    ],
  ],
  [
    'U_SockStatus',
    'FUN',
    'EN',
    'ENO',
    [
      ['Unit', 0, null],
      ['Socket', 1, null],
      ['Dst', 2, 2],
    ],
  ],
  [
    'U_SockSelectPort',
    'FUN',
    'EN',
    'ENO',
    [
      ['Unit', 0, null],
      ['Socket', 1, null],
      ['Port', 2, null],
    ],
  ],
  [
    'U_SockNonProcRecvSetting',
    'FUN',
    'EN',
    'ENO',
    [
      ['Unit', 0, null],
      ['Socket', 1, null],
      ['Setting', 2, null, true],
    ],
  ],
  [
    'U_SockReadBuf',
    'FUN',
    'EN',
    'ENO',
    [
      ['Unit', 0, null],
      ['Socket', 1, null],
      ['Dst', 2, 2],
    ],
  ],
  [
    'U_SockWriteBuf',
    'FUN',
    'EN',
    'ENO',
    [
      ['Unit', 0, null],
      ['Socket', 1, null],
      ['SendData', 2, null, true],
    ],
  ],
  [
    'RefreshX',
    'FUN',
    'EN',
    'ENO',
    [
      ['InRelay', 0, 0],
      ['BitSize', 1, null],
    ],
  ],
  [
    'RefreshY',
    'FUN',
    'EN',
    'ENO',
    [
      ['OutRelay', 0, 0],
      ['BitSize', 1, null],
    ],
  ],
  [
    'RefreshCyclicOutput',
    'FUN',
    'EN',
    'ENO',
    [
      ['Unit', 0, null],
      ['NodeAdr', 1, null],
      ['Connection', 2, null],
    ],
  ],
  [
    'U_CyclicStop',
    'FUN',
    'EN',
    'ENO',
    [
      ['Unit', 0, null],
      ['In', 1, null, true],
    ],
  ],
  [
    'U_CyclicStart',
    'FUN',
    'EN',
    'ENO',
    [
      ['Unit', 0, null],
      ['In', 1, null, true],
    ],
  ],
  [
    'U_MsgTo',
    'FUN',
    'EN',
    'ENO',
    [
      ['Unit', 0, null],
      ['Setting', 1, null, true],
    ],
  ],
  [
    'U_MsgSend',
    'FUN',
    'EN',
    'ENO',
    [
      ['Unit', 0, null],
      ['SendData', 1, null, true],
    ],
  ],
  [
    'U_MsgRecv',
    'FUN',
    'EN',
    'ENO',
    [
      ['Unit', 0, null],
      ['Dst', 1, 1],
    ],
  ],
  [
    'U_MsgStatus',
    'FUN',
    'EN',
    'ENO',
    [
      ['Unit', 0, null],
      ['Dst', 1, 1],
    ],
  ],
  [
    'StringMove',
    'FUN',
    'EN',
    'ENO',
    [
      ['Src', 0, null],
      ['Dst', null, 0],
    ],
  ],
  ['RefreshFreerunCounter', 'FUN', 'EN', 'ENO', []],
  [
    'SUB',
    'FUN',
    'EN',
    'ENO',
    [
      ['Result', null, 0],
      ['In1', 0, null],
      ['In2', 1, null],
    ],
  ],
  ['EnableInterrupt', 'FUN', 'EN', 'ENO', []],
  ['DisableInterrupt', 'FUN', 'EN', 'ENO', []],
  ['DisableInterruptRange', 'FUN', 'EN', 'ENO', [['Dst', null, 0]]],
  ['LoggingTrigger', 'FUN', 'EN', 'ENO', [['ID', 0, null]]],
  ['OperationRecordCapture', 'FUN', 'EN', 'ENO', [['ID', 0, null]]],
  [
    'OperationRecordSave',
    'FUN',
    'EN',
    'ENO',
    [
      ['ID', 0, null],
      ['TrgComment', 1, null],
    ],
  ],
  [
    'TON',
    'FBEAND',
    'In',
    'Q',
    [
      ['PT', 0, null],
      ['ET', null, 0],
    ],
  ],
  [
    'StructSort',
    'FBEAND',
    'Execute',
    'Done',
    [
      ['InOut', 0, 0],
      ['Count', 1, null],
      ['Order', 2, null],
      ['MemberName', 3, null],
      ['ProcTime', 4, null],
      ['Busy', null, 1],
      ['Error', null, 2],
      ['ErrorID', null, 3],
    ],
  ],
  [
    'StorageWriteBin',
    'FBEXEC',
    'Execute',
    'Done',
    [
      ['Path', 0, null],
      ['Mode', 1, null],
      ['ByteSize', 2, null],
      ['WritePos', 3, null],
      ['Src', 4, null],
      ['ByteSizeRes', null, 0],
      ['WritePosRes', null, 1],
      ['Busy', null, 2],
      ['Error', null, 3],
      ['ErrorID', null, 4],
    ],
  ],
  [
    'StoragePrint',
    'FBEXEC',
    'Execute',
    'Done',
    [
      ['Path', 0, null],
      ['Src', 1, null],
      ['Busy', null, 0],
      ['Error', null, 1],
      ['ErrorID', null, 2],
    ],
  ],
  [
    'StorageGetFileList',
    'FBEXEC',
    'Execute',
    'Done',
    [
      ['DirPath', 0, null],
      ['SearchFileName', 1, null],
      ['Order', 2, null],
      ['MaxFileListNum', 3, null],
      ['FileList', 4, 4],
      ['ResultNum', null, 0],
      ['Busy', null, 1],
      ['Error', null, 2],
      ['ErrorID', null, 3],
    ],
  ],
  [
    'SocketTCP_ActiveOpen',
    'FBEXEC',
    'Execute',
    'Done',
    [
      ['EthernetPort', 0, null],
      ['SrcPortNo', 1, null],
      ['DstAddress', 2, null],
      ['DstPortNo', 3, null],
      ['SocketNo', null, 0],
      ['Busy', null, 1],
      ['Error', null, 2],
      ['ErrorID', null, 3],
    ],
  ],
  [
    'SocketTCP_Send',
    'FBEXEC',
    'Execute',
    'Done',
    [
      ['SocketNo', 0, null],
      ['ByteSize', 1, null],
      ['Src', 2, null],
      ['Busy', null, 0],
      ['Error', null, 1],
      ['ErrorID', null, 2],
    ],
  ],
  [
    'SocketTCP_Recv',
    'FBEXEC',
    'Execute',
    'Done',
    [
      ['SocketNo', 0, null],
      ['ByteSize', 1, null],
      ['Dst', 2, 2],
      ['Timeout', 3, null],
      ['RecvByteSize', null, 0],
      ['Busy', null, 1],
      ['Error', null, 3],
      ['ErrorID', null, 4],
    ],
  ],
  [
    'SocketClose',
    'FBEXEC',
    'Execute',
    'Done',
    [
      ['SocketNo', 0, null],
      ['Busy', null, 0],
      ['Error', null, 1],
      ['ErrorID', null, 2],
    ],
  ],
  [
    'SocketUDP_Open',
    'FBEXEC',
    'Execute',
    'Done',
    [
      ['EthernetPort', 0, null],
      ['SrcPortNo', 1, null],
      ['SocketNo', null, 0],
      ['Busy', null, 1],
      ['Error', null, 2],
      ['ErrorID', null, 3],
    ],
  ],
  [
    'SocketUDP_Recv',
    'FBEXEC',
    'Execute',
    'Done',
    [
      ['SocketNo', 0, null],
      ['MaxByteSize', 1, null],
      ['Dst', 2, 2],
      ['Timeout', 3, null],
      ['RecvByteSize', null, 0],
      ['SrcAddress', null, 1],
      ['SrcPortNo', null, 3],
      ['Busy', null, 4],
      ['Error', null, 5],
      ['ErrorID', null, 6],
    ],
  ],
  [
    'SocketUDP_Send',
    'FBEXEC',
    'Execute',
    'Done',
    [
      ['SocketNo', 0, null],
      ['DstAddress', 1, null],
      ['DstPortNo', 2, null],
      ['ByteSize', 3, null],
      ['Src', 4, null],
      ['Busy', null, 0],
      ['Error', null, 1],
      ['ErrorID', null, 2],
    ],
  ],
  [
    'Ping',
    'FBEAND',
    'Execute',
    'Done',
    [
      ['DstAddress', 0, null],
      ['Timeout', 1, null],
      ['Busy', null, 0],
      ['Error', null, 1],
      ['ErrorID', null, 2],
    ],
  ],
];
// These mnemonic variants change placement, not the function's declaration.
const callFamily = (op: string) =>
  /^(FUN|FUNLD|FUNAND)$/.test(op) ? 'FUN' : /^(FBEXEC|FBEAND)$/.test(op) ? 'FBEXEC' : op;
const byCall = new Map(
  signatures.map((signature) => [
    callFamily(signature[1]) + ':' + signature[0].toUpperCase(),
    signature,
  ]),
);

export function keyenceKvxFunction(opcode: string, fb: KeyenceFb): KeyenceFb {
  const op = opcode.toUpperCase(),
    signature = byCall.get(callFamily(op) + ':' + fb.name.toUpperCase());
  if (!signature || signature[4].length !== fb.pins.length) return fb;
  return {
    ...fb,
    knownSignature: true,
    powerInput: op === 'FUNLD' ? null : signature[2],
    powerOutput: signature[3],
    pins: fb.pins.map((pin, index) => {
      const [name, inputRow, outputRow, constant] = signature[4][index];
      return {
        ...pin,
        name,
        direction: constant
          ? 'inout'
          : inputRow === null
            ? 'output'
            : outputRow === null
              ? 'input'
              : 'inout',
        ...(constant ? { constant } : {}),
        ...(inputRow !== null ? { inputRow } : {}),
        ...(outputRow !== null ? { outputRow } : {}),
      };
    }),
  };
}
