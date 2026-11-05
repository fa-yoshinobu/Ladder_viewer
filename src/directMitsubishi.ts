import {alignInstructions,commandKey} from './compareCore';
import {alignCircuitRows} from './comparison';
import {compareConnections} from './connections';
import type {Program,ComparisonChange} from './model';
import {deviceComment,type DeviceComments} from './comments';
import {contactKey} from './instructions';
export function compareMitsubishiPrograms(sourceInput:Program,targetInput:Program,sourceComments:DeviceComments={},targetComments:DeviceComments={}):Program {
 if(sourceInput.comparison||targetInput.comparison)throw new Error('直接比較には通常の命令リストCSVを指定してください。');
 const source=structuredClone(sourceInput),target=structuredClone(targetInput);
 const describe=(p:Program,comments:DeviceComments)=>p.networks.map(n=>{
  const actions=new Set(n.actions.map(a=>a.instruction.id)),conditions=new Set<string>();
  const visit=(logic:NonNullable<typeof n.evaluation>|null)=>{if(!logic)return;if(logic.kind==='contact')conditions.add(logic.instruction.id);else logic.children.forEach(visit);};
  for(const action of n.actions)visit(action.condition);visit(n.evaluation??null);
  return n.instructions.map(i=>({id:i.id,opcode:i.op,operands:i.operands,line:i.sourceRow,contactKey:conditions.has(i.id)?contactKey(i.op,i.operands):undefined,
   role:actions.has(i.id)?'action' as const:conditions.has(i.id)?'condition' as const:'structure' as const,
   family:i.op==='ANB'||i.op==='ORB'?'block-join':i.op,
   annotation:JSON.stringify([i.statement,i.piStatement??'',i.note,i.inlineST?.text??'',i.operands.map(v=>deviceComment(v,comments))])}));
 });
 const sources=new Map(source.instructions.map(i=>[i.id,i])),targets=new Map(target.instructions.map(i=>[i.id,i]));
 const changes:ComparisonChange[]=[];let shiftedSteps=0;
 const pairs=alignInstructions(describe(source,sourceComments),describe(target,targetComments));
 pairs.forEach((pair,index)=>{
  const row=index+1,a=pair.source&&sources.get(pair.source.id),b=pair.target&&targets.get(pair.target.id);
  if(a)a.comparisonRow=row;if(b)b.comparisonRow=row;
  const same=pair.source&&pair.target&&commandKey(pair.source)===commandKey(pair.target)&&pair.source.annotation===pair.target.annotation;
  if(same){if(a!.step!==b!.step)shiftedSteps++;return;}
  const kind=!a?'added':!b?'removed':'changed';
  const text=(i:typeof a)=>i?[i.op,...i.operands].join(' '):'';
  changes.push({sourceRow:a?.sourceRow??b!.sourceRow,alignmentRow:row,sourceCsvRow:a?.sourceRow,targetCsvRow:b?.sourceRow,
   sourceText:text(a),targetText:text(b),sourceStep:a?.step??'',targetStep:b?.step??'',kind});
  for(const [own,other] of [[a,b],[b,a]])if(own)own.difference={kind,opChanged:kind==='changed'&&own.op!==other?.op,
   operandChanges:kind==='changed'?own.operands.flatMap((v,index)=>v!==other?.operands[index]?[index]:[]):[],otherText:text(other),otherStep:other?.step??''};
 });
 alignCircuitRows(source.networks,target.networks);compareConnections(source.networks,target.networks);
 source.comparison={target,sourceProject:source.name,targetProject:target.name,sourceName:source.name,targetName:target.name,
  rowCount:pairs.length,differentRows:changes.length,changes,shiftedSteps};
 return source;
}
