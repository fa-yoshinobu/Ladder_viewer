import type {KeyenceDeviceComments} from './comments';

export interface KeyenceFbPin {name:string;value:string;operandIndex:number;direction?:'input'|'output'|'inout';inputRow?:number;outputRow?:number;constant?:boolean;}
export interface KeyenceFb {name:string;pins:KeyenceFbPin[];instance?:string;instanceOperandIndex?:number;knownSignature?:boolean;powerInput?:string|null;powerOutput?:string|null;}
export interface KeyenceScriptDisplay {id:string;expanded:boolean;instructionIds:string[];hiddenDifference?:boolean;}
export interface KeyenceInstruction {
 id:string;sourceLine:number;sourceEndLine?:number;opcode:string;operands:string[];raw:string;
 comment:string;statement:string;comparisonRow?:number;disabled?:boolean;
 fb?:KeyenceFb;
 macro?:{parameters:{name:string;comment:string}[];comment?:string};
 st?:{lines:{sourceLine:number;raw:string;text:string}[];legacyScript?:boolean};
 script?:KeyenceScriptDisplay;
 difference?:{kind:'changed'|'added'|'removed';opChanged:boolean;operandChanges:number[];otherText:string;otherLine?:number};
}
export interface KeyenceProgram {
 format:'keyence-mnm';name:string;relativePath?:string;deviceCode:string;moduleName:string;moduleType:string;
 instructions:KeyenceInstruction[];text:string;deviceComments:KeyenceDeviceComments;
 metadata:{sourceLine:number;key:string;value:string}[];
 comments:{sourceLine:number;text:string}[];
}
