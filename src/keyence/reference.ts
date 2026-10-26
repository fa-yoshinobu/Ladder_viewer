import {parseDocument,DomUtils} from 'htmlparser2';
import type {KeyenceProgram,KeyenceInstruction,KeyenceFb,KeyenceFbPin} from './model';
type Node=ReturnType<typeof parseDocument>['children'][number];
const has=(node:Node,cls:string)=>'attribs' in node&&(node.attribs.class??'').split(/\s+/).includes(cls);
function find(node:Node,cls:string):Node[]{const result:Node[]=[],pending=[node];while(pending.length){const n=pending.pop()!;if(has(n,cls))result.push(n);if('children'in n)pending.push(...[...n.children].reverse());}return result;}
function text(node:Node|undefined):string {
 if(!node)return '';
 if('attribs'in node&&node.attribs.title!==undefined)return node.attribs.title;
 if(node.type==='text')return node.data;
 if('name'in node&&node.name==='br')return '\n';
 return 'children'in node?node.children.map(text).join(''):'';
}
const clean=(value:string)=>value.replace(/\u00a0/g,' ').trim();
const compact=(value:string)=>value.replace(/\s+/g,'');
function ancestor(node:Node,tag:string):Node|undefined{let n=node.parent;while(n){if('name'in n&&n.name===tag)return n;n=n.parent;}return undefined;}
export function keyenceFallbackFb(instruction:KeyenceInstruction):KeyenceFb {
 return {name:instruction.operands[0]??instruction.opcode,title:'',defined:false,pins:instruction.operands.slice(1).map((value,index)=>({name:'引数'+(index+1),direction:'argument',value,comment:'',description:'',operandIndex:index+1}))};
}
function readFb(root:Node):KeyenceFb[] {
 return find(root,'FBTitle').flatMap(title=>{
  const table=ancestor(title,'table');if(!table)return [];
  const pins:KeyenceFbPin[]=[];
  for(const pin of find(table,'FBParamName')){
   const row=ancestor(pin,'tr');if(!row)continue;
   const direction=has(pin,'FBParamOut')?'out':'in',device=find(row,'FBDeviceName')[0];
   if(!device)continue;
   pins.push({name:clean(text(pin)),direction,value:clean(text(device)),comment:clean(text(find(row,'FBDeviceComment')[0])),description:clean(text(find(row,'FBParamComment')[0]))});
  }
  return [{name:clean(text(title)),title:clean(text(find(table,'FBTitleComment')[0])),defined:true,pins}];
 });
}
function matchFb(instruction:KeyenceInstruction,reference:KeyenceFb):KeyenceFb|null{
 if(instruction.operands[0]!==reference.name)return null;
 const used=new Set<number>(),names=new Map<string,number>(),pins:KeyenceFbPin[]=[];
 for(const pin of reference.pins){
  let index=names.get(pin.name);
  if(index!==undefined&&instruction.operands[index]!==pin.value)return null;
  if(index===undefined)index=instruction.operands.findIndex((value,index)=>index>0&&!used.has(index)&&value===pin.value);
  if(index<1){if(!/^(?:#|\+)?\d+$/.test(pin.value))return null;index=undefined;}
  else{used.add(index);names.set(pin.name,index);}
  pins.push({...pin,operandIndex:index});
 }
 if(used.size!==instruction.operands.length-1)return null;
 return {...reference,pins};
}
function withoutSource(statement:string,source:string):string {
 const lines=statement.split('\n'),needle=compact(source),whole=lines.map(compact).join('');
 const start=whole.indexOf(needle);if(start<0)return statement;
 let at=0;return lines.filter(line=>{const next=at+compact(line).length,keep=next<=start||at>=start+needle.length;at=next;return keep;}).join('\n').trim();
}
// HTML is parsed as inert text. No images, styles, links or scripts are loaded or executed.
export function applyKeyenceReference(program:KeyenceProgram,html?:string):void {
 for(const i of program.instructions)if(/^(FB|FUN)$/i.test(i.opcode))i.fb=keyenceFallbackFb(i);
 if(!html)return;
 try{
 const root=parseDocument(html),title=clean(text(DomUtils.getElementsByTagName('title',root.children,true)[0]));
 if(title&&title!==program.moduleName&&title!==program.name.replace(/\.mnm$/i,''))return;
 const definitions=readFb(root);
 for(const i of program.instructions)if(i.fb){
  const at=definitions.findIndex(fb=>matchFb(i,fb)!==null);
  if(at>=0){i.fb=matchFb(i,definitions[at])!;definitions.splice(at,1);}
 }
 const scripts=find(root,'ScriptLayout').map(node=>clean(text(node))).filter(Boolean);
 linkKeyenceScripts(program,scripts);
 }catch{
  for(const i of program.instructions){if(i.fb)i.fb=keyenceFallbackFb(i);delete i.script;delete i.displayStatement;}
  program.referenceWarning='補助HTMLを解析できなかったため、FBを簡易表示しています。';
 }
}

export function linkKeyenceScripts(program:KeyenceProgram,sources:string[]):void {
 const scripts=[...new Set(sources)];
 let consumed=-1;
 for(let index=0;index<program.instructions.length;index++){
  const i=program.instructions[index];if(i.opcode.toUpperCase()!=='NCJ'||index<=consumed)continue;
  const guard=program.instructions[index-1],statement=[guard?.statement??'',i.statement].join('\n');
  const source=scripts.find(source=>compact(statement).includes(compact(source)));if(!source)continue;
  const ends=program.instructions.flatMap((candidate,n)=>n>index&&candidate.opcode.toUpperCase()==='LABEL'&&candidate.operands[0]===i.operands[0]?[n]:[]);
  if(ends.length!==1)continue;
  const end=ends[0];i.script={text:source,endId:program.instructions[end].id,bodyIds:program.instructions.slice(index+1,end+1).map(row=>row.id)};
  if(guard)guard.displayStatement=withoutSource(guard.statement,source);
  i.displayStatement=withoutSource(i.statement,source);consumed=end;
 }
}
