import test from 'node:test';
import assert from 'node:assert/strict';
import {highlightKeyenceScriptRows} from '../src/keyence/scriptSyntax.ts';
import {KeyenceScriptToggle} from '../src/keyence/Ladder.tsx';
import {KeyenceStBox} from '../src/keyence/blocks.tsx';
import {keyenceStBoxGeometry} from '../src/keyence/blockGeometry.ts';
import {strokeCoordinates} from '../src/drawing.ts';
import type {KeyenceInstruction} from '../src/keyence/model.ts';
import type {KeyenceSymbol} from '../src/keyence/layout.ts';

// Original dummy script and UI fixtures; no supplied PLC project is copied here.
function nodes(value:any):any[] {
 if(!value||typeof value!=='object')return [];
 if(Array.isArray(value))return value.flatMap(nodes);
 if(typeof value.type==='function')return nodes(value.type(value.props));
 return [value,...nodes(value.props?.children)];
}
function content(value:any):string {
 if(value==null||typeof value==='boolean')return '';
 if(Array.isArray(value))return value.map(content).join('');
 return typeof value==='object'?content(value.props?.children):String(value);
}

test('legacy script comments end at the source newline and survive visual wrapping',()=>{
 const rows=[{text:'IF DummyReady THEN',continuation:false},{text:"DummyValue = 73 ' an invented comment",continuation:false},
  {text:' continued IF 99',continuation:true},{text:'',continuation:false},{text:'DummyValue = ABS(-8)',continuation:false}];
 const colored=highlightKeyenceScriptRows(rows);
 assert.deepEqual(colored.map(parts=>parts.map(p=>p.text).join('')),rows.map(row=>row.text));
 assert.equal(colored[0][0].kind,'keyword');
 assert.ok(colored[1].some(p=>p.kind==='comment'&&p.text==="' an invented comment"));
 assert.deepEqual(colored[2],[{text:' continued IF 99',kind:'comment'}]);
 assert.deepEqual(colored[3],[]);
 assert.ok(colored[4].some(p=>p.kind==='function'&&p.text==='ABS'));
 assert.ok(colored[4].some(p=>p.kind==='number'&&p.text==='-8'));
 assert.ok(colored[4].every(p=>p.kind!=='comment'));
});

test('double-quoted legacy strings protect apostrophes while single quotes start comments',()=>{
 const rows=[{text:'DummyText = "It\'s a ""dummy"" string"',continuation:false},{text:"DummyValue = 8 ' IF Dummy THEN",continuation:false}];
 const colored=highlightKeyenceScriptRows(rows);
 assert.deepEqual(colored.map(parts=>parts.map(p=>p.text).join('')),rows.map(row=>row.text));
 assert.ok(colored[0].some(p=>p.kind==='string'&&p.text==='"It\'s a ""dummy"" string"'));
 assert.ok(colored[0].every(p=>p.kind!=='comment'));
 assert.ok(colored[1].some(p=>p.kind==='comment'&&p.text==="' IF Dummy THEN"));
 assert.ok(colored[1].every(p=>p.kind!=='string'));
 assert.deepEqual(highlightKeyenceScriptRows([]),[]);
});

test('script toggle exposes state and supports click, Enter and Space without selecting the circuit',()=>{
 for(const expanded of [false,true]){
  const calls:string[]=[];
  const toggle=KeyenceScriptToggle({script:{id:'dummy-script',expanded,instructionIds:['dummy-line']},left:82,y:40,onToggle:id=>calls.push(id)})!;
  assert.equal(toggle.props.role,'button');assert.equal(toggle.props.tabindex,0);
  assert.equal(toggle.props['aria-expanded'],expanded);
  assert.equal(toggle.props['aria-label'],expanded?'スクリプトを折りたたむ':'スクリプトを展開');
  let stopped=0,prevented=0;
  const event=(key='')=>({key,repeat:false,stopPropagation:()=>stopped++,preventDefault:()=>prevented++});
  toggle.props.onClick(event());toggle.props.onKeyDown(event('Enter'));toggle.props.onKeyDown(event(' '));toggle.props.onKeyDown(event('ArrowDown'));
  assert.deepEqual(calls,['dummy-script','dummy-script','dummy-script']);assert.equal(stopped,3);assert.equal(prevented,2);
  toggle.props.onKeyDown({...event(' '),repeat:true});
  assert.equal(calls.length,3);assert.equal(prevented,3,'holding Space does not scroll or repeatedly toggle');
  const paths=nodes(toggle).filter(n=>n.type==='path');
  assert.equal(paths[0].props.d.includes('V'),!expanded,'only the collapsed state shows the vertical plus stroke');
  const rect=nodes(toggle).find(n=>n.type==='rect')!;
  assert.ok(rect.props.x+rect.props.width<82,'toggle stays inside the left gutter');
  assert.equal(rect.props.y+rect.props.height/2,40,'toggle aligns with the first circuit baseline');
 }
 assert.equal(KeyenceScriptToggle({left:82,y:40}),null,'native ST has no script toggle');
});

test('legacy BOX_ST uses comment coloring without changing native KV-X quoted strings or color toggle classes',()=>{
 const code="DummyValue = 'quoted text' + 8";
 const draw=(legacy:boolean)=>{
  const instruction:KeyenceInstruction={id:'dummy-box',sourceLine:5,opcode:'BOX_ST',operands:[],raw:'BOX_ST',comment:'',statement:'',
   st:{lines:[{sourceLine:6,raw:';'+code,text:code}],...(legacy?{legacyScript:true}:{})}};
  const g=keyenceStBoxGeometry(instruction);
  const symbol:KeyenceSymbol={instruction,x:82,y:40,width:g.width,kind:'st-box',negated:false,pulse:null,label:'BOX_ST',comment:'',commentLines:[]};
  return nodes(KeyenceStBox({symbol,c:strokeCoordinates(1,1,0,0)}));
 };
 const legacy=draw(true),native=draw(false);
 assert.ok(legacy.some(n=>n.type==='tspan'&&n.props.class==='st-comment'&&content(n)==="'quoted text' + 8"));
 assert.ok(!legacy.some(n=>n.props.class==='st-string'));
 assert.ok(native.some(n=>n.type==='tspan'&&n.props.class==='st-string'&&content(n)==="'quoted text'"));
 assert.ok(!native.some(n=>n.props.class==='st-comment'));
 for(const n of [...legacy,...native].filter(n=>n.type==='tspan'))assert.equal(n.props.fill,undefined,'CSS keeps the existing color setting in control');
});
