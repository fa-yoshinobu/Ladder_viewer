import type {Instruction} from './model';
import {isPointerDefinition} from './instructions';
import {deviceComment,type DeviceComments} from './comments';
import {formatInstructionCopy} from './textCopy';

export function instructionCopyText(instruction:Instruction,comments:DeviceComments):string {
 const command=[instruction.op,...instruction.operands].join(' ');
 const addresses=isPointerDefinition(instruction.op)?[instruction.op,...instruction.operands]:instruction.operands;
 const labels=addresses.map(address=>({address,comment:deviceComment(address,comments)}));
 const extras=[instruction.piStatement,instruction.note,instruction.inlineST?.text,...(instruction.pins??[]).map(pin=>instructionCopyText(pin,comments))].filter((text):text is string=>!!text);
 return formatInstructionCopy(command,labels,extras);
}
