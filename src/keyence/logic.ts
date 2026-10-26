import type {KeyenceInstruction,KeyenceProgram} from './model';

export type KeyenceExpression =
 | {kind:'contact';instruction:KeyenceInstruction;negated:boolean;pulse:'rise'|'fall'|null;comparison:string|null}
 | {kind:'unary';instruction:KeyenceInstruction;input:KeyenceExpression|null;operation:'rise'|'fall'|'invert'}
 | {kind:'and'|'or';left:KeyenceExpression;right:KeyenceExpression};
export interface KeyenceAction {
 instruction:KeyenceInstruction;condition:KeyenceExpression|null;
 resetCondition?:KeyenceExpression|null;continuations?:KeyenceInstruction[];
}
export interface KeyenceNetwork {
 id:string;statement:string;instructions:KeyenceInstruction[];actions:KeyenceAction[];
 condition:KeyenceExpression|null;warnings:string[];
}
type ContactSpec={join:'load'|'and'|'or';negated:boolean;pulse:'rise'|'fall'|null;comparison:string|null};
const contactOps:Record<string,[ContactSpec['join'],boolean,ContactSpec['pulse']]> = {
 LD:['load',false,null],LDB:['load',true,null],LDP:['load',false,'rise'],LDF:['load',false,'fall'],
 LDPB:['load',true,'rise'],LDFB:['load',true,'fall'],
 AND:['and',false,null],ANB:['and',true,null],ANP:['and',false,'rise'],ANF:['and',false,'fall'],
 ANPB:['and',true,'rise'],ANFB:['and',true,'fall'],
 OR:['or',false,null],ORB:['or',true,null],ORP:['or',false,'rise'],ORF:['or',false,'fall'],
 ORPB:['or',true,'rise'],ORFB:['or',true,'fall'],
 BLD:['load',false,null],BLDB:['load',true,null],BAND:['and',false,null],BANB:['and',true,null],
 BOR:['or',false,null],BORB:['or',true,null],
};
function contactSpec(opcode:string):ContactSpec|null {
 const op=opcode.toUpperCase(),spec=contactOps[op];
 if(spec)return {join:spec[0],negated:spec[1],pulse:spec[2],comparison:op.startsWith('B')?'B':null};
 const compare=/^(LD|AND|OR)([<>=]+)(\.[A-Z]+)?$/.exec(op);
 return compare?{join:compare[1]==='LD'?'load':compare[1]==='AND'?'and':'or',negated:false,pulse:null,comparison:compare[2]+(compare[3]??'')}:null;
}

// KEYENCE ANB/ORB are b contacts. Block operations are ANL/ORL.
// Expression objects keep the identity of shared conditions saved by MPS.
export function buildKeyenceNetworks(program:KeyenceProgram):KeyenceNetwork[] {
 const networks:KeyenceNetwork[]=[];
 let current:KeyenceExpression|null=null,blocks:KeyenceExpression[]=[],saved:{condition:KeyenceExpression|null;depth:number}[]=[];
 let instructions:KeyenceInstruction[]=[],actions:KeyenceAction[]=[],warnings:string[]=[],statements:string[]=[];
 let restored=false,continuation=false;
 const warn=(message:string)=>{if(!warnings.includes(message))warnings.push(message);};
 const flush=()=>{
  if(!instructions.length)return;
  if(saved.length)warn('MPSに対応するMPPがありません。');
  if(blocks.length)warn('接点ブロックの結合命令が不足しています。');
  if(continuation)warn('CONの後に接続する命令がありません。');
  if(!actions.length)warn('出力命令がありません。');
  networks.push({id:instructions[0].id,statement:statements.join('\n'),instructions,actions,condition:current,warnings});
  current=null;blocks=[];saved=[];instructions=[];actions=[];warnings=[];statements=[];restored=false;continuation=false;
 };
 for(const instruction of program.instructions){
  const op=instruction.opcode.toUpperCase(),spec=contactSpec(op);
  if(op==='END'||op==='ENDH') {
   flush();instructions.push(instruction);
   if(instruction.statement)statements.push(instruction.statement);
   actions.push({instruction,condition:null});flush();continue;
  }
  if(spec?.join==='load'&&actions.length&&!saved.length&&!restored)flush();
  instructions.push(instruction);
  if(instruction.statement)statements.push(instruction.statement);
  if(spec){
   const contact:KeyenceExpression={kind:'contact',instruction,negated:spec.negated,pulse:spec.pulse,comparison:spec.comparison};
   if(spec.join==='load'){if(current)blocks.push(current);current=contact;}
   else if(current)current={kind:spec.join,left:current,right:contact};
   else{warn(`${instruction.opcode}の前にLD接点がありません。`);current=contact;}
  }else if(op==='MEP'||op==='MEF'||op==='INV'){
   current={kind:'unary',instruction,input:current,operation:op==='MEP'?'rise':op==='MEF'?'fall':'invert'};
  }else if(op==='ANL'||op==='ORL'){
   const left=blocks.pop();
   if(left&&current)current={kind:op==='ANL'?'and':'or',left,right:current};
   else warn(`${op}に対応する接点ブロックがありません。`);
  }else if(op==='MPS'){
   if(!current)warn('MPSで保存する条件がありません。');
   saved.push({condition:current,depth:blocks.length});
  }else if(op==='MRD'||op==='MPP'){
   const state=op==='MPP'?saved.pop():saved.at(-1);
   if(state){current=state.condition;blocks.length=state.depth;restored=true;}
   else warn(`${op}に対応するMPSがありません。`);
  }else if(op==='CON'){
   if(!actions.length||continuation)warn('CONの接続元の命令がありません。');
   continuation=true;
  }else if(op==='KEEP'){
   const setCondition=blocks.pop()??null;
   if(!setCondition||!current)warn('KEEPのSET/RES条件が不足しています。');
   actions.push({instruction,condition:setCondition,resetCondition:current});
   current=setCondition;restored=false;
  }else{
   if(continuation&&actions.length){
    (actions.at(-1)!.continuations??=[]).push(instruction);
    continuation=false;
   }else actions.push({instruction,condition:current});
   restored=false;
  }
 }
 flush();return networks;
}
