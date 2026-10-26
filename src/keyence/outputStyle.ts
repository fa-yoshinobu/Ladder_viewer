import type {KeyenceInstruction} from './model';

export interface KeyenceOutputStyle {
 kind:'coil'|'command'|'keep'|'timer'|'counter'|'labeled-coil'|'calculation'|'application';
 body:string;above:string;bodyOperand?:number;aboveOperand?:number;
}
export function keyenceNumberedDevice(instruction:KeyenceInstruction):string {
 const opcode=instruction.opcode.toUpperCase(),prefix=opcode==='TMR'?'T':opcode==='OUTC'?'C':'';
 if(!prefix)return '';
 const match=new RegExp('^(?:#|'+prefix+')(\\d+)$','i').exec(instruction.operands[0]??'');
 return match?prefix+match[1]:'';
}
// Only confirmed native symbols get a special shape; other commands keep their complete text.
export function keyenceOutputStyle(instruction:KeyenceInstruction):KeyenceOutputStyle {
 const opcode=instruction.opcode.toUpperCase(),operands=instruction.operands;
 const style:KeyenceOutputStyle={kind:'command',body:[instruction.opcode,...operands].join(' '),above:''};
 if(opcode==='OUT'&&operands.length===1)return {...style,kind:'coil',body:operands[0],bodyOperand:0};
 if(opcode==='KEEP'&&operands.length===1)return {...style,kind:'keep',body:instruction.opcode,above:operands[0],aboveOperand:0};
 if((opcode==='SET'||opcode==='RES')&&operands.length===1)return {...style,kind:'labeled-coil',body:instruction.opcode,above:operands[0],aboveOperand:0};
 const device=keyenceNumberedDevice(instruction);
 if(device&&operands.length===2)return {...style,kind:opcode==='TMR'?'timer':'counter',body:device,above:operands[1],bodyOperand:0,aboveOperand:1};
 if((/^(?:LDA|STA)(?:\.[SFL])?$/.test(opcode)&&operands.length===1)||
    (['FLOAT.S','ROUND.S','TBCD','TBIN','NEG'].includes(opcode)&&operands.length===0))
  return {...style,kind:'calculation',body:instruction.opcode,above:operands[0]??'',aboveOperand:0};
 if(opcode==='EXT.S'&&operands.length===0)return {...style,kind:'application',body:instruction.opcode};
 return style;
}
