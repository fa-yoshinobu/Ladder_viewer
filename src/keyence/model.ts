import type {KeyenceDeviceComments} from './comments';

export interface KeyenceFbPin {name:string;direction:'in'|'out'|'argument';value:string;comment:string;description:string;operandIndex?:number;}
export interface KeyenceFb {name:string;title:string;defined:boolean;pins:KeyenceFbPin[];}
export interface KeyenceInstruction {
 id:string;sourceLine:number;opcode:string;operands:string[];raw:string;
 comment:string;statement:string;comparisonRow?:number;displayStatement?:string;
 fb?:KeyenceFb;script?:{text:string;endId:string;bodyIds:string[]};
 difference?:{kind:'changed'|'added'|'removed';opChanged:boolean;operandChanges:number[];otherText:string;otherLine?:number};
}
export interface KeyenceProgram {
 format:'keyence-mnm';name:string;relativePath?:string;deviceCode:string;moduleName:string;moduleType:string;referenceWarning?:string;
 instructions:KeyenceInstruction[];text:string;deviceComments:KeyenceDeviceComments;
 metadata:{sourceLine:number;key:string;value:string}[];
 comments:{sourceLine:number;text:string}[];
}
