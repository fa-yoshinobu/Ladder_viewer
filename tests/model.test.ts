import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeCsv, parseProgram, instructionKey, type Logic } from '../src/model.ts';
import { networkSize } from '../src/layout.ts';
function csv(lines: string[][]) { return ['"test"', '"機種情報:"\t"QCPU"', '"ステップ番号"\t"行間ステートメント"\t"命令"\t"I/O(デバイス)"\t"空欄"\t"PIステートメント"\t"ノート"', ...lines.map(r => r.map(s => `"${s.replaceAll('"', '""')}"`).join('\t'))].join('\r\n'); }
function expression(e: Logic | null): string { if (!e) return 'TRUE'; return e.kind === 'contact' ? e.instruction.operands.join(' ') : '(' + e.children.map(expression).join(e.kind === 'and' ? ' & ' : ' | ') + ')'; }
test('continuation operands, note and source mapping are retained', () => {
 const p = parseProgram(csv([['0','','LD','SM400'],['1','','MOV','K1'],['','','','D520','','','メモ']]), 'x.csv');
 assert.deepEqual(p.instructions[1].operands, ['K1','D520']); assert.equal(p.instructions[1].note,'メモ'); assert.equal(p.instructions[1].sourceRow,5);
 assert.equal(instructionKey(p.instructions[1]), '["MOV",["K1","D520"]]');
});
test('parallel series and branch restoration retain output conditions', () => {
 const ops = [['LD','X0'],['OR','X1'],['MPS',''],['ANI','X2'],['OUT','Y0'],['MRD',''],['AND','X3'],['OUT','Y1'],['MPP',''],['LD','X4'],['OR','X5'],['ANB',''],['OUT','Y2']];
 const p = parseProgram(csv(ops.map(([op,arg],i)=>[String(i),'',op,arg])), 'x.csv');
 assert.equal(p.networks.length,1); assert.deepEqual(p.networks[0].actions.map(a=>expression(a.condition)), ['((X0 | X1) & X2)','((X0 | X1) & X3)','((X0 | X1) & (X4 | X5))']); assert.deepEqual(p.networks[0].warnings,[]);
});
test('malformed input and unbalanced branch do not silently succeed', () => {
 assert.throws(()=>parseProgram('a,b\n1,2','bad.csv'), /対応/);
 const p = parseProgram(csv([['0','','MPP',''],['1','','OUT','Y0']]), 'x.csv'); assert.match(p.networks[0].warnings[0], /不足|ありません/);
});
test('02_MBUS all instructions/operands preserved and finite layouts', () => {
 const bytes = readFileSync(new URL('../public/02_MBUS.csv', import.meta.url));
 const start = performance.now(); const p = parseProgram(decodeCsv(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)), '02_MBUS.csv');
 assert.equal(p.instructions.filter(i=>i.op==='MOV').length,138);
 assert.equal(p.instructions.filter(i=>i.op==='MPS').length,36);
 assert.equal(p.instructions.filter(i=>i.op==='MPP').length,36);
 assert.equal(p.networks.flatMap(n=>n.instructions).length,p.instructions.length);
 assert.deepEqual(p.networks.flatMap(n=>n.warnings),[]);
 assert.deepEqual(p.instructions.find(i=>i.op==='MOV')?.operands,['K1','D520']);
 for(const n of p.networks) { const s=networkSize(n); assert.ok(Number.isFinite(s.height)&&s.height>0); assert.ok(Number.isFinite(s.width)&&s.width>0); }
 console.log(JSON.stringify({instructions:p.instructions.length,networks:p.networks.length,actions:p.networks.reduce((s,n)=>s+n.actions.length,0),maxWidth:Math.max(...p.networks.map(n=>networkSize(n).width)),parseMs:Math.round(performance.now()-start)}));
});

test('grid keeps common contacts once and all network widths fixed', async () => {
 const {gridLayout}=await import('../src/layout.ts');
 const p=parseProgram(csv([['0','','LD','SM400'],['1','','MOV','K1'],['','','','D520'],['3','','MOV','K2'],['','','','D540']]),'x');
 const g=gridLayout(p.networks[0]); assert.equal(g.symbols.filter(s=>s.contact).length,1); assert.equal(g.symbols.filter(s=>!s.contact).length,2);
 assert.equal(g.symbols.filter(s=>!s.contact)[0].col,g.symbols.filter(s=>!s.contact)[1].col);
});
test('重量測定部: pin records stay inside FB, special contacts retained, fixed grid wraps long circuits', async()=>{
 const {gridLayout,COLUMNS}=await import('../src/layout.ts');
 const bytes=readFileSync(new URL('../public/重量測定部.csv',import.meta.url));const start=performance.now();
 const p=parseProgram(decodeCsv(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),'重量測定部.csv');
 assert.equal(p.instructions.length,4031);assert.deepEqual(p.networks.flatMap(n=>n.warnings),[]);
 const fb=p.instructions.filter(i=>i.op.startsWith('FBCALL '));assert.equal(fb.length,3);assert.ok(fb.every(i=>i.pins?.length));
 assert.ok(!p.networks.flatMap(n=>n.actions).some(a=>/ (IN|OUT):/.test(a.instruction.op)));
 const grids=p.networks.map(gridLayout);assert.equal(new Set(grids.map(g=>g.width)).size,1);assert.ok(grids.some(g=>g.pages>1));
 const displayed=grids.flatMap(g=>g.symbols).filter(s=>s.contact).map(s=>s.instruction.op);
 for(const op of ['ANDPI','LDPI','INV','MEP'])assert.ok(displayed.includes(op),op+' should be inline');
 for(const g of grids)for(const s of g.symbols)assert.ok(Math.floor(s.col/COLUMNS)===Math.floor((s.col+s.span-1)/COLUMNS),'symbol crosses a page');
 console.log(JSON.stringify({name:p.name,instructions:p.instructions.length,networks:p.networks.length,fb:fb.length,wrapped:grids.filter(g=>g.pages>1).length,parseAndLayoutMs:Math.round(performance.now()-start)}));
});

test('Mitsubishi sample symbols: SET/RST/PLS and timer OUT stay commands',async()=>{
 const {isCoil}=await import('../src/layout.ts');
 const p=parseProgram(csv([['0','','OUT','M1'],['1','','OUT','T0'],['','','','K10'],['4','','SET','M2'],['5','','RST','Z8'],['6','','PLS','M3']]),'symbols');
 assert.deepEqual(p.instructions.map(isCoil),[true,false,false,false,false]);
});

test('pointer definitions label the following rung; CALL stays an action', async () => {
 const {gridLayout}=await import('../src/layout.ts');
 const p=parseProgram(csv([['0','SIM','P1099',''],['0','','LD','SM402'],['1','','SET','X80'],['3','','LD','M1'],['4','','CALL','P1099'],['6','','P0',''],['6','','LD','M2'],['7','','OUT','Y0']]),'p.csv');
 assert.equal(p.networks.length,3);
 assert.equal(p.networks[0].pointer?.op,'P1099');
 assert.equal(p.networks[0].title,'SIM');
 assert.deepEqual(p.networks[0].actions.map(a=>a.instruction.op),['SET']);
 assert.deepEqual(p.networks[1].actions.map(a=>a.instruction.op),['CALL']);
 assert.equal(p.networks[2].pointer?.op,'P0');
 assert.deepEqual(p.networks.flatMap(n=>n.instructions).map(i=>i.id),p.instructions.map(i=>i.id));
 assert.ok(!p.networks.flatMap(n=>gridLayout(n).symbols).some(s=>/^P\d+$/.test(s.instruction.op)));
 assert.deepEqual(p.networks.flatMap(n=>n.warnings),[]);
});