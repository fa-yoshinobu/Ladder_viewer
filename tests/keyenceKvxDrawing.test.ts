import test from 'node:test';
import assert from 'node:assert/strict';
import {parseKeyenceMnm} from '../src/keyence/parser.ts';
import {buildKeyenceNetworks} from '../src/keyence/logic.ts';
import {compareKeyencePrograms} from '../src/keyence/comparison.ts';
import {layoutKeyenceNetwork,keyenceViewDrawing,keyenceDrawingPages} from '../src/keyence/layout.ts';
import {keyenceBlockGeometry} from '../src/keyence/blockGeometry.ts';
import {KeyenceBlock} from '../src/keyence/blocks.tsx';
import {strokeCoordinates} from '../src/drawing.ts';
import {BASELINE,ROW,CELL} from '../src/ladderMetrics.ts';
import type {KeyenceSymbol} from '../src/keyence/layout.ts';

// All identifiers, values and circuits below are original dummy inputs.
const parse=(commands:string[])=>parseKeyenceMnm(new TextEncoder().encode(['DEVICE:60',';MODULE:DummyDrawing',...commands].join('\n')).buffer,'dummy.mnm');
const drawings=(commands:string[],comments=false)=>{const p=parse(commands);return buildKeyenceNetworks(p).map(n=>layoutKeyenceNetwork(n,p,comments));};
type Node={type:string;props:Record<string,any>};
function rendered(value:any):Node[]{
 if(value==null||typeof value==='boolean')return [];
 if(Array.isArray(value))return value.flatMap(rendered);
 if(typeof value!=='object')return [];
 if(typeof value.type==='function')return rendered(value.type(value.props));
 return [...(typeof value.type==='string'?[value]:[]),...rendered(value.props?.children)];
}
function textContent(value:any):string{
 if(value==null||typeof value==='boolean')return '';
 if(Array.isArray(value))return value.map(textContent).join('');
 if(typeof value!=='object')return String(value);
 return textContent(typeof value.type==='function'?value.type(value.props):value.props?.children);
}
const nodes=(s:KeyenceSymbol)=>rendered(KeyenceBlock({symbol:s,c:strokeCoordinates(1,1,0,0)}));
const texts=(s:KeyenceSymbol)=>nodes(s).filter(n=>n.type==='text').map(n=>({value:textContent(n),x:n.props.x,y:n.props.y}));

test('KV-X functions place confirmed input, output and inout arguments on their own sides',()=>{
 const d=drawings(['LD MR7','FUN AryShiftL DummySamples +5 +2','FUN MOVE DummyInput DummyOutput','END'])[0];
 const shift=d.symbols.find(s=>s.instruction.fb?.name==='AryShiftL')!,move=d.symbols.find(s=>s.instruction.fb?.name==='MOVE')!;
 assert.equal(shift.instruction.fb!.knownSignature,true);
 const g=keyenceBlockGeometry(shift.instruction.fb!),fields=texts(shift).filter(t=>t.value==='DummySamples');
 assert.equal(fields.length,2);assert.ok(fields[0].x<shift.x+g.left&&fields[1].x>shift.x+g.right);assert.equal(fields[0].y,fields[1].y);
 assert.ok(texts(shift).some(t=>t.value==='EN'));assert.ok(texts(shift).some(t=>t.value==='ENO'));
 const mg=keyenceBlockGeometry(move.instruction.fb!),mf=texts(move);
 assert.ok(mf.find(t=>t.value==='DummyInput')!.x<move.x+mg.left);
 assert.ok(mf.find(t=>t.value==='DummyOutput')!.x>move.x+mg.right);
 assert.equal(nodes(move).find(n=>n.type==='text'&&textContent(n)==='DummyInput')!.props.style.textAnchor,'end');
 assert.equal(nodes(move).find(n=>n.type==='text'&&textContent(n)==='DummyOutput')!.props.style.textAnchor,'start');
 assert.ok(move.y>shift.y+g.bottom,'the following block clears every pin row');
 const socket=drawings(['LD MR5','FBEXEC SocketTCP_ActiveOpen DummyLink +1 +0 DummyHost +12345 DummySocket ??? ??? ???'])[0].symbols.find(s=>s.kind==='fb')!;
 assert.deepEqual(keyenceBlockGeometry(socket.instruction.fb!).pins.find(p=>p.pin.name==='EthernetPort')!.nameLines,['EthernetPort']);
});

test('KV-X condition blocks keep EN/Result and In/Q wiring, with an unwired FUNLD input',()=>{
 const d=drawings(['FUNLD DegToRad DummyRadians DummyDegrees','FUNAND EQ DummyLeft DummyRight','FBEAND TON DummyTimer T#125ms ???','OUT DummyResult'])[0];
 const blocks=d.symbols.filter(s=>s.kind==='fb');assert.equal(blocks.length,3);assert.ok(blocks.every(s=>s.condition));
 for(const [index,expected] of ['ENO','Result','Q'].entries())assert.ok(texts(blocks[index]).some(t=>t.value===expected));
 const first=blocks[0],g=keyenceBlockGeometry(first.instruction.fb!);
 assert.ok(texts(first).some(t=>t.value==='EN'));
 assert.ok(!nodes(first).some(n=>n.type==='line'&&n.props.x1===strokeCoordinates(1,1,0,0).x(first.x)&&n.props.x2===strokeCoordinates(1,1,0,0).x(first.x+g.left)&&n.props.y1===strokeCoordinates(1,1,0,0).y(first.y)));
 assert.ok(texts(blocks[2]).some(t=>t.value==='DummyTimer'&&t.y<blocks[2].y+keyenceBlockGeometry(blocks[2].instruction.fb!).bodyTop));
 for(const mode of ['wrap','scroll'] as const){
  const view=keyenceViewDrawing(d,mode);
  assert.equal(view.symbols.length,d.symbols.length);
  for(const s of view.symbols.filter(s=>s.kind==='fb')){
   const shape=keyenceBlockGeometry(s.instruction.fb!);
   assert.ok(s.x>=view.left&&s.x+s.width<=view.width);
   assert.ok(s.y+shape.top>=0&&s.y+shape.bottom<view.height);
  }
 }
});

test('FB instances and long original arguments wrap without truncation and enlarge only their network',()=>{
 const instance='DummyInstance_'+('LongName_'.repeat(8)),value='DummyArgument_'+('FullIdentifier_'.repeat(12));
 const d=drawings(['LD MR8',`FBEXEC UnknownBlock ${instance} ${value} #9`,'OUT MR9'])[0];
 const s=d.symbols.find(s=>s.kind==='fb')!,g=keyenceBlockGeometry(s.instruction.fb!);
 assert.equal(g.known,false);assert.equal(s.width,6*CELL);
 assert.ok(g.instanceLines.length>1);assert.ok(g.pins[0].valueLines.length>2);
 assert.ok(texts(s).some(t=>t.value===instance));assert.ok(texts(s).some(t=>t.value===value));
 assert.ok(!texts(s).some(t=>t.value.includes('…')));
 assert.ok(d.baseline>BASELINE);assert.ok(s.y+g.top>=d.headerHeight);assert.ok(s.y+g.bottom<d.height);
 assert.ok(d.symbols.find(symbol=>symbol.instruction.opcode==='OUT')!.y>s.y+g.bottom);
 const normal=drawings(['LD MR1','OUT MR2'])[0];assert.equal(normal.baseline,BASELINE);assert.equal(normal.rowHeight,ROW);
});

test('declared asymmetric pin rows and instance-only difference colors survive block rendering',()=>{
 const fifo=drawings(['LD MR3','FUN FIFORead DummyTable +13 DummyCount DummyReadValue'])[0].symbols.find(s=>s.kind==='fb')!;
 const g=keyenceBlockGeometry(fifo.instruction.fb!),fields=texts(fifo),right=fields.filter(t=>t.x>fifo.x+g.right);
 assert.ok(right.find(t=>t.value==='DummyTable')!.y<right.find(t=>t.value==='DummyReadValue')!.y);
 assert.ok(right.find(t=>t.value==='DummyReadValue')!.y<right.find(t=>t.value==='DummyCount')!.y);
 for(const value of ['DummyTable','DummyCount'])assert.equal(fields.filter(t=>t.value===value)[0].y,fields.filter(t=>t.value===value)[1].y);
 const before=['LD MR4','FBEXEC StoragePrint DummyWriter "dummy.txt" DummyPayload ??? ??? ???'];
 const comparison=compareKeyencePrograms(parse(before),parse(before.map(line=>line.replace('DummyWriter','DummyWriterChanged'))));
 for(const p of [comparison.source,comparison.target]){
  const s=buildKeyenceNetworks(p).flatMap(n=>layoutKeyenceNetwork(n,p).symbols).find(symbol=>symbol.kind==='fb')!;
  const changed=nodes(s).filter(n=>n.type==='text'&&String(n.props.class).includes('diff-value')).map(textContent);
  assert.deepEqual(changed,[s.instruction.fb!.instance]);
  assert.ok(texts(s).some(t=>t.value==='Execute'));assert.ok(texts(s).some(t=>t.value==='Done'));
 }
});

test('ST and annotation networks reserve content height without invented ladder symbols or rails',()=>{
 const p=parse(['AREA_ST',';DummyValue := 7;',';'+('DummyText '.repeat(32)),'END','RUNG_COMMENT "Dummy annotation"','BOOKMARK "Dummy bookmark"','ENDH']);
 const ds=buildKeyenceNetworks(p).map(n=>layoutKeyenceNetwork(n,p));
 const st=ds.find(d=>d.st)!;assert.ok(st);assert.deepEqual(st.symbols,[]);assert.deepEqual(st.wires,[]);assert.deepEqual(st.rails,[]);
 const wrapped=keyenceViewDrawing(st,'wrap'),scroll=keyenceViewDrawing(st,'scroll');
 assert.ok(wrapped.stRows!.length>scroll.stRows!.length);assert.ok(wrapped.height>scroll.height);assert.equal(keyenceDrawingPages(wrapped).length,1);
 for(const d of ds.filter(d=>d.network.instructions.every(i=>['BOOKMARK','RUNG_COMMENT'].includes(i.opcode)))){
  assert.equal(d.rows,0);assert.equal(d.height,d.headerHeight);assert.deepEqual(d.symbols,[]);assert.deepEqual(d.wires,[]);assert.deepEqual(d.rails,[]);
 }
});
