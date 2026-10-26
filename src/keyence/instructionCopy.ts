import type {KeyenceInstruction,KeyenceProgram} from './model';
import {keyenceDeviceComment} from './comments';
import {formatInstructionCopy} from '../textCopy';

// MNM inline comments do not identify an operand when a command has several devices.
export function keyenceInstructionCopyText(instruction:KeyenceInstruction,program:KeyenceProgram):string {
 const labels=instruction.operands.map(address=>({address,comment:keyenceDeviceComment(address,program.deviceComments)})).filter(item=>item.comment);
 const timer=instruction.opcode.toUpperCase()==='TMR'&&/^#\d+$/.test(instruction.operands[0]??'')?'T'+instruction.operands[0].slice(1):'';
 if(timer){const comment=keyenceDeviceComment(timer,program.deviceComments);if(comment)labels.push({address:timer,comment});}
 const devices=[...new Set(instruction.operands.filter(address=>/^@?(?:MR|LR|CR|DM|EM|FM|CM|TM|R|T|C|B|W)[0-9A-F]+(?:\.[0-9A-F]+)?(?::L?Z\d+)?$/i.test(address)))];
 const target=timer||(devices.length===1?devices[0]:'');
 const inline=instruction.comment,extras:string[]=[];
 if(inline&&target){
  const existing=labels.find(item=>item.address===target);
  if(existing)existing.comment=inline;else labels.push({address:target,comment:inline});
 }else if(inline&&!labels.some(item=>item.comment===inline))extras.push(inline);
 return formatInstructionCopy([instruction.opcode,...instruction.operands].join(' '),labels,extras);
}
