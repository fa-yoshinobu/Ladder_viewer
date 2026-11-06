import test from 'node:test';
import assert from 'node:assert/strict';
import {parseKeyenceMnm} from '../src/keyence/parser.ts';
import {keyenceOutputStyle,keyenceBoxColumnSpans} from '../src/keyence/outputStyle.ts';
import {keyenceMacroGeometry} from '../src/keyence/macroGeometry.ts';
import {KeyenceNativeSymbol} from '../src/keyence/nativeSymbols.tsx';
import {layoutKeyenceNetwork,keyenceViewDrawing,type KeyenceSymbol} from '../src/keyence/layout.ts';
import {buildKeyenceNetworks} from '../src/keyence/logic.ts';
import {strokeCoordinates} from '../src/drawing.ts';
import {CELL} from '../src/ladderMetrics.ts';

// Entirely invented instructions, macro names and comments; no supplied program is a fixture.
function symbol(text:string,parameters?:{name:string;comment:string}[]):KeyenceSymbol {
 const instruction=parseKeyenceMnm(new TextEncoder().encode('DEVICE:99\n'+text).buffer,'dummy-macro.mnm').instructions[0];
 if(parameters)instruction.macro={parameters};
 const style=keyenceOutputStyle(instruction);
 return {instruction,x:100,y:50,width:style.operands?keyenceBoxColumnSpans(style).reduce((a,b)=>a+b,0)*CELL:CELL,
  kind:style.kind,negated:false,pulse:null,label:text,comment:'',commentLines:[],showComments:true};
}
function nodes(value:any):any[] {
 if(!value||typeof value!=='object')return [];
 if(Array.isArray(value))return value.flatMap(nodes);
 if(typeof value.type==='function')return nodes(value.type(value.props));
 return [value,...nodes(value.props?.children)];
}
function text(value:any):string {
 if(value==null||typeof value==='boolean')return '';
 if(Array.isArray(value))return value.map(text).join('');
 return typeof value==='object'?text(value.props?.children):String(value);
}
const draw=(s:KeyenceSymbol)=>nodes(KeyenceNativeSymbol({symbol:s,c:strokeCoordinates(1,1,0,0)}));
const fields=(s:KeyenceSymbol,className:string)=>draw(s).filter(n=>n.type==='text'&&n.props.class===className);

test('LOGD and LOGE use compact bracketed applications and preserve operand differences',()=>{
 for(const opcode of ['LOGD','LOGE','@LOGD']){
  const s=symbol(opcode+' #47');
  s.instruction.difference={kind:'changed',opChanged:false,operandChanges:[0],otherText:opcode+' #48'};
  assert.equal(keyenceOutputStyle(s.instruction).kind,'application');
  assert.equal(s.width,CELL);
  assert.deepEqual(fields(s,'operator').map(text),[opcode.replace('@','')]);
  assert.deepEqual(fields(s,'device').map(text),['#47']);
  assert.ok(fields(s,'device')[0].props.y<s.y);
  assert.equal(draw(s).filter(n=>n.type==='rect').length,0);
  assert.deepEqual(draw(s).filter(n=>n.props.class==='diff-value').map(text),['#47']);
  assert.equal(draw(s).some(n=>n.props.class==='contact kv-execution-pulse'),opcode.startsWith('@'));
 }
 const invalid=symbol('LOGD #47 #48');
 assert.equal(keyenceOutputStyle(invalid.instruction).body,'LOGD #47 #48');
});

test('MCALL keeps every argument in its own labelled column and preserves wire endpoints',()=>{
 const parameters=[{name:'Signal',comment:''},{name:'Limit',comment:''},{name:'Result',comment:''}];
 const s=symbol('MCALL DummyClamp DM710 #63 DM711',parameters);
 s.inputDifference='removed';s.outputDifference='added';
 assert.equal(s.width,3*CELL);
 assert.deepEqual(fields(s,'device kv-macro-parameter').map(text),['Signal','Limit','Result']);
 const values=fields(s,'device kv-native-operand');
 assert.deepEqual(values.map(text),['DM710','#63','DM711']);
 assert.ok(values.every((v,index)=>index===0||v.props.x>values[index-1].props.x));
 assert.ok(values.every(v=>v.props.y===s.y+9));
 assert.equal(fields(s,'operator').map(text).join(''),'MCALL DummyClamp');
 const lines=draw(s).filter(n=>n.type==='line');
 assert.equal(lines.filter(n=>n.props.x1===n.props.x2).length,2);
 assert.ok(lines.some(n=>n.props.class==='wire wire-removed'&&n.props.x1===s.x+.5&&n.props.x2===s.x+6+.5&&n.props.y1===s.y+.5));
 assert.ok(lines.some(n=>n.props.class==='wire wire-added'&&n.props.x1===s.x+s.width-6+.5&&n.props.x2===s.x+s.width+.5&&n.props.y2===s.y+.5));
});

test('MCALL accepts any argument count, grows only as needed and retains unresolved parameter names',()=>{
 for(const count of [1,2,3,7]){
  const values=Array.from({length:count},(_,index)=>'DM'+(730+index));
  const s=symbol('MCALL DummyPass '+values.join(' '));
  assert.equal(s.width,Math.max(3,count)*CELL);
  assert.deepEqual(fields(s,'device kv-native-operand').map(text),values);
  assert.deepEqual(fields(s,'device kv-macro-parameter').map(text),values.map((_,index)=>'P'+index));
 }
 const longName=symbol('MCALL DummyMacroWithAnUnusuallyLongDescriptiveName DM740');
 assert.ok(longName.width>3*CELL);
 assert.ok(fields(longName,'operator').map(text).join('').includes('DummyMacroWithAnUnusuallyLongDescriptiveName'));
 const longValue=symbol('MCALL DummyPass VeryLongInventedOperandName DM741 DM742');
 assert.deepEqual(keyenceBoxColumnSpans(keyenceOutputStyle(longValue.instruction)),[3,1,1]);
 const longParameter=symbol('MCALL DummyPass DM740 DM741 DM742',[{name:'VeryLongInventedParameterName',comment:''}]);
 assert.deepEqual(keyenceBoxColumnSpans(keyenceOutputStyle(longParameter.instruction)),[3,1,1]);
 assert.deepEqual(fields(longParameter,'device kv-macro-parameter').map(text),['VeryLongInventedParameterName','P1','P2']);
});

test('MCALL highlights only the changed macro name or argument and supports execution pulses',()=>{
 const s=symbol('@MCALL DummyMixer DM750 DM751 DM752');
 s.instruction.difference={kind:'changed',opChanged:false,operandChanges:[0,2],otherText:'MCALL DummyOldMixer DM750 DM759 DM752'};
 assert.deepEqual(draw(s).filter(n=>n.props.class==='diff-value').map(text),['DummyMixer','DM751']);
 assert.ok(draw(s).some(n=>n.props.class==='contact kv-execution-pulse'));
 s.instruction.difference={kind:'changed',opChanged:true,operandChanges:[],otherText:'MCALL DummyMixer DM750 DM751 DM752'};
 assert.deepEqual(draw(s).filter(n=>n.props.class==='diff-value').map(text),['MCALL']);
});

test('MCALL comments follow the display setting with bounded height and full text retained',()=>{
 const comment='Invented description deliberately longer than two small columns';
 const s=symbol('MCALL DummyLimit DM760 DM761 DM762',[{name:'Input',comment},{name:'Floor',comment:'Lower'},{name:'Output',comment:''}]);
 const geometry=keyenceMacroGeometry(s.instruction,true);
 assert.equal(geometry.parameters[0].commentLines.length,2);
 assert.ok(geometry.parameters[0].commentLines[1].endsWith('…'));
 assert.equal(geometry.top,-32);assert.equal(geometry.bottom,40);
 assert.equal(fields(s,'device-comment').length,2);
 assert.ok(draw(s).some(n=>n.type==='title'&&text(n)===comment));
 s.instruction.macro!.comment='An unsplit general note';
 const annotated=keyenceMacroGeometry(s.instruction,true);
 assert.equal(annotated.annotationY,51);assert.equal(annotated.bottom,52);
 const annotation=fields(s,'device-comment').at(-1)!;
 assert.equal(annotation.props.y,s.y+51);
 assert.ok(draw(s).some(n=>n.type==='title'&&text(n)==='An unsplit general note'));
 s.showComments=false;
 assert.equal(fields(s,'device-comment').length,0);
 assert.equal(keyenceMacroGeometry(s.instruction,false).bottom,17);
});

test('MCALL headers and comments fit the circuit row, and wide argument lists remain visible after wrapping',()=>{
 for(const count of [3,15]){
  const operands=Array.from({length:count},(_,index)=>'DM'+(780+index));
  const program=parseKeyenceMnm(new TextEncoder().encode('DEVICE:99\nLD R780\nMCALL DummyBounds '+operands.join(' ')).buffer,'dummy-macro-bounds.mnm');
  const instruction=program.instructions[1];
  instruction.macro={parameters:operands.map((_,index)=>({name:'Field'+index,comment:'Invented note'}))};
  for(const comments of [false,true]){
   const drawing=layoutKeyenceNetwork(buildKeyenceNetworks(program)[0],program,comments);
   const s=drawing.symbols.find(s=>s.instruction===instruction)!;
   const geometry=keyenceMacroGeometry(instruction,comments);
   assert.equal(s.blockRows,1,'a normal two-line comment does not create an extra empty row');
   assert.ok(s.y+geometry.top>=drawing.headerHeight);
   assert.ok(s.y+geometry.bottom<drawing.height);
   const wrapped=keyenceViewDrawing(drawing,'wrap');
   const macro=wrapped.symbols.find(s=>s.instruction===instruction)!;
   assert.ok(macro.x>=wrapped.left&&macro.x+macro.width<=wrapped.right);
   assert.deepEqual(fields(macro,'device kv-native-operand').map(text),operands);
  }
 }
});
