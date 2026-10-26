import type {KeyenceDeviceComments} from './comments';

export interface KeyenceInstruction {
 id:string;sourceLine:number;opcode:string;operands:string[];raw:string;
 comment:string;statement:string;comparisonRow?:number;
 difference?:{kind:'changed'|'added'|'removed';opChanged:boolean;operandChanges:number[];otherText:string;otherLine?:number};
}
export interface KeyenceProgram {
 format:'keyence-mnm';name:string;relativePath?:string;deviceCode:string;moduleName:string;moduleType:string;
 instructions:KeyenceInstruction[];text:string;deviceComments:KeyenceDeviceComments;
 metadata:{sourceLine:number;key:string;value:string}[];
 comments:{sourceLine:number;text:string}[];
}
