import type {ComponentChildren} from 'preact';
import type {ChangeKind,CompareSide} from './compareCore';
export interface DirectInstruction {id:string;op:string;operands:string[];line:string;step?:string;sourceLine?:number;sourceEndLine?:number;comment:string;copyText:string;statement:string;row?:number;controlFlow?:{label:string;targetId?:string;targetStep?:string};difference?:{kind:ChangeKind|'step';otherText:string};}
export interface DirectChange {id:number;kind:ChangeKind|'step';sourceText:string;targetText:string;sourceLine:string;targetLine:string;}
export interface DirectCircuit {
 id:string;title:string;height:number;instructions:DirectInstruction[];locations:{id:string;x:number;y:number;width:number}[];
 render:(selected:string,choose:(instruction:DirectInstruction)=>void,context:(event:MouseEvent,instruction:DirectInstruction)=>void,navigate:(id:string)=>void)=>ComponentChildren;
}
export interface DirectBlock {source:DirectCircuit[];target:DirectCircuit[];changes:DirectChange[];}
export interface DirectSelection {side:CompareSide;instruction:DirectInstruction;}
export interface DirectNavigation {id:string;side:CompareSide;request:number;}
