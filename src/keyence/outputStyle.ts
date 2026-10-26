import type {KeyenceInstruction} from './model';

export interface KeyenceOutputStyle {
 kind:'coil'|'command'|'keep'|'timer'|'counter'|'labeled-coil'|'calculation'|'application'|'fb'|'script';
 body:string;above:string;bodyOperand?:number;aboveOperand?:number;
}
export function keyenceNumberedDevice(instruction:KeyenceInstruction):string {
 const opcode=instruction.opcode.toUpperCase(),prefix=opcode==='TMR'||opcode==='TMS'?'T':opcode==='OUTC'?'C':'';
 if(!prefix)return '';
 const match=new RegExp('^(?:#|'+prefix+')(\\d+)$','i').exec(instruction.operands[0]??'');
 return match?prefix+match[1]:'';
}
// Only confirmed native symbols get a special shape; other commands keep their complete text.
export function keyenceOutputStyle(instruction:KeyenceInstruction):KeyenceOutputStyle {
 const opcode=instruction.opcode.toUpperCase(),operands=instruction.operands;
 const style:KeyenceOutputStyle={kind:'command',body:[instruction.opcode,...operands].join(' '),above:''};
 if(instruction.script)return {...style,kind:'script'};
 if(instruction.fb)return {...style,kind:'fb'};
 if(opcode==='OUT'&&operands.length===1)return {...style,kind:'coil',body:operands[0],bodyOperand:0};
 if(opcode==='KEEP'&&operands.length===1)return {...style,kind:'keep',body:instruction.opcode,above:operands[0],aboveOperand:0};
 if((opcode==='SET'||opcode==='RES')&&operands.length===1)return {...style,kind:'labeled-coil',body:instruction.opcode,above:operands[0],aboveOperand:0};
 const device=keyenceNumberedDevice(instruction);
 if(['TMR','TMS','OUTC'].includes(opcode)&&operands.length===2)return {...style,kind:opcode==='OUTC'?'counter':'timer',body:device?(opcode==='TMS'?'TS'+device.slice(1):device):(opcode==='OUTC'?'C ':opcode==='TMS'?'TS ':'T ')+operands[0],above:operands[1],bodyOperand:0,aboveOperand:1};
 if((/^(?:LDA|STA)(?:\.[SFLD])?$/.test(opcode)&&operands.length===1)||
    (['FLOAT.S','ROUND.S','TBCD','TBIN','NEG','EI'].includes(opcode)&&operands.length===0))
  return {...style,kind:'calculation',body:instruction.opcode,above:operands[0]??'',aboveOperand:0};
 if(opcode==='EXT.S'&&operands.length===0)return {...style,kind:'application',body:instruction.opcode};
 return style;
}
