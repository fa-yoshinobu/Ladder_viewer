import type {Action,Instruction,Logic,Network,Program} from './model';
import {isFunctionCall,pinDefinition} from './gxFormat';
import {isComparisonCondition} from './instructions';
export interface FunctionPort {definition:Instruction;name:string;type:string;action?:Action;}
export interface FunctionBlock {call:Instruction;name:string;instance:string;kind:'FB'|'FUN';inputs:FunctionPort[];outputs:FunctionPort[];}
const width=(logic:Logic|null):number=>!logic?0:logic.kind==='contact'?(isComparisonCondition(logic.instruction.op)||logic.instruction.op==='PHASE'?1+logic.instruction.operands.length:1):logic.kind==='and'?logic.children.reduce((sum,c)=>sum+width(c),0):Math.max(...logic.children.map(width));
export function assembleFunctionBlocks(program:Program):void {
 const merged:Network[]=[];
 for(let index=0;index<program.networks.length;){
  const first=program.networks[index],block=first.instructions[0]?.block;
  if(!block?.closed){merged.push(first);index++;continue;}
  const networks:Network[]=[];
  while(index<program.networks.length&&program.networks[index].instructions[0]?.block?.id===block.id)networks.push(program.networks[index++]);
  const instructions=networks.flatMap(n=>n.instructions),calls=instructions.filter(i=>isFunctionCall(i.op));
  const call=calls[0],match=call&&/^(FBCALL|FUNCALL)\s+(.+?)(?:\s*\(([^()]*)\))?$/.exec(call.op);
  const fallback=()=>{networks[0].warnings.push('FB/FUNの端子と回路の対応を確認できないため、元の回路を表示します。');merged.push(...networks);};
  if(calls.length!==1||!match||!call.pins?.length||(block.kind==='FB')!==(match[1]==='FBCALL')){fallback();continue;}
  const fb:FunctionBlock={call,name:match[2],instance:match[3]??match[2],kind:block.kind,inputs:[],outputs:[]};
  for(const definition of call.pins){const pin=pinDefinition(definition.op)!;const port={definition,name:pin[1],type:pin[3]};if(pin[2]!=='OUT')fb.inputs.push({...port});if(pin[2]!=='IN')fb.outputs.push({...port});}
  let valid=true;
  for(const action of networks.flatMap(n=>n.actions).filter(a=>a.instruction!==call)){
   const i=action.instruction;
   if(i.sourceRow<call.sourceRow){
    const destination=i.op==='OUT'&&i.operands.length===1?i.operands[0]:i.op==='MOV'&&i.operands.length===2?i.operands[1]:undefined;
    const port=fb.inputs.find(p=>destination===`${fb.instance}.${p.name}`||block.kind==='FUN'&&destination===p.name);
    if(!port||port.action||width(action.condition)>(i.op==='MOV'?2:4)){valid=false;break;}
    port.action=action;
   }else{
    const condition=action.condition;
    const source=i.op==='MOV'?(i.operands.length===2&&condition?.kind==='contact'&&condition.instruction.op==='LD'&&condition.instruction.operands[0]==='TRUE'?i.operands[0]:undefined)
     :condition?.kind==='contact'&&condition.instruction.op==='LD'?condition.instruction.operands[0]:undefined;
    const port=fb.outputs.find(p=>source===`${fb.instance}.${p.name}`||block.kind==='FUN'&&source===p.name);
    if(!port||port.action||!['OUT','SET','RST','MOV'].includes(i.op)){valid=false;break;}
    port.action=action;
   }
  }
  if(!valid){fallback();continue;}
  merged.push({...first,title:[...new Set(networks.map(n=>n.title).filter(Boolean))].join('\n'),instructions,
   actions:networks.flatMap(n=>n.actions),warnings:networks.flatMap(n=>n.warnings),functionBlock:fb});
 }
 program.networks=merged;
}
