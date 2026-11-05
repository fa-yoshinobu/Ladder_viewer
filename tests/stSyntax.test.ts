import test from 'node:test';
import assert from 'node:assert/strict';
import {highlightStRows,stTokens} from '../src/stSyntax.ts';
import {parseKeyenceMnm} from '../src/keyence/parser.ts';
import {keyenceStLayout,keyenceStChangedLines} from '../src/keyence/structuredText.ts';
import {keyenceStBoxGeometry} from '../src/keyence/blockGeometry.ts';
import {keyenceInstructionCopyText} from '../src/keyence/instructionCopy.ts';
import {compareKeyencePrograms} from '../src/keyence/comparison.ts';

// Independently written dummy code; no sample projects are copied into tests.
const parts=(source:string)=>stTokens(source).map(token=>({kind:token.kind,text:source.slice(token.start,token.end)}));
const parse=(opcode:string,code:string[])=>parseKeyenceMnm(new TextEncoder().encode(['DEVICE:60',...(opcode==='BOX_ST'?['LD MR67']:[]),opcode,...code.map(s=>';'+s),'END'].join('\n')).buffer,'dummy-st-colors.mnm');

test('ST colors keywords, types, literals and calls without changing identifiers or text',()=>{
 const source="if DummyReady AND NOT DummyFault THEN\n DummyValue : DINT := 16#2F;\n DummyValue := ABS(-2.5E+3);\n DummyText := 'IF // (* <tag> $\' ok';\nEND_IF;";
 const tokens=parts(source);
 assert.equal(tokens.map(t=>t.text).join(''),source);
 for(const [text,kind] of [['if','keyword'],['AND','keyword'],['DINT','type'],['16#2F','number'],['2.5E+3','number'],['ABS','function'],['END_IF','keyword']]){
  assert.ok(tokens.some(t=>t.text===text&&t.kind===kind),text);
 }
 assert.ok(tokens.some(t=>t.kind==='string'&&t.text.includes('IF // (* <tag>')));
 assert.ok(parts('DummyIF IF_Dummy 日本語変数').every(t=>t.kind==='plain'));
 assert.deepEqual(parts('2#0011_1010 8#17 BOOL#TRUE T#2s DATE#2026-01-12').filter(t=>t.kind!=='plain').map(t=>t.kind),Array(5).fill('number'));
});

test('nested comments, multiline comments and quoted comment markers keep their context',()=>{
 const source="(* outer\n (* inner *)\n IF FALSE THEN *)\nDummy := 'it''s // text'; // IF 42\n/* another\n comment */ Dummy := TRUE;";
 const tokens=parts(source);
 assert.equal(tokens.map(t=>t.text).join(''),source);
 assert.ok(tokens.some(t=>t.kind==='comment'&&t.text==='(* outer\n (* inner *)\n IF FALSE THEN *)'));
 assert.ok(tokens.some(t=>t.kind==='string'&&t.text==="'it''s // text'"));
 assert.ok(tokens.some(t=>t.kind==='comment'&&t.text==='// IF 42'));
 assert.ok(tokens.some(t=>t.kind==='keyword'&&t.text==='TRUE'));
 assert.equal(parts('(* unclosed\nIF').at(-1)!.kind,'comment');
 assert.equal(parts("'unclosed IF").at(-1)!.kind,'string');
});

test('wrapping inside keywords, strings and comments preserves color and every character',()=>{
 const rows=[{text:'END_',continuation:false},{text:'IF;',continuation:true},{text:"Dummy := 'abc",continuation:false},{text:"def'; // comment",continuation:true},{text:'continued',continuation:true},{text:'(* block',continuation:false},{text:' IF *)',continuation:false},{text:'',continuation:false},{text:'TRUE',continuation:false}];
 const colored=highlightStRows(rows);
 assert.deepEqual(colored.map(row=>row.map(t=>t.text).join('')),rows.map(row=>row.text));
 assert.equal(colored[0][0].kind,'keyword');assert.equal(colored[1][0].kind,'keyword');
 assert.equal(colored[3][0].kind,'string');assert.equal(colored[4][0].kind,'comment');
 assert.ok(colored[6].every(t=>t.kind==='comment'));assert.deepEqual(colored[7],[]);assert.equal(colored[8][0].kind,'keyword');
 assert.deepEqual(highlightStRows([]),[]);
});

test('AREA_ST and BOX_ST coloring preserves wrapping, copying and changed-line comparison',()=>{
 for(const opcode of ['AREA_ST','BOX_ST']){
  const code=['IF DummyReady THEN',"\tDummyText := '"+'x'.repeat(320)+"';",'(* comment',' retained *)','END_IF;'];
  const program=parse(opcode,code),instruction=program.instructions.find(i=>i.st)!;
  const original=JSON.stringify(instruction),copy=keyenceInstructionCopyText(instruction,program);
  for(const rows of [keyenceStLayout(instruction,true).rows,keyenceStLayout(instruction,false).rows,keyenceStBoxGeometry(instruction).rows]){
   const colored=highlightStRows(rows);
   assert.deepEqual(colored.map(row=>row.map(part=>part.text).join('')),rows.map(row=>row.text));
   for(let n=0;n<rows.length;n++)if(rows[n].text.startsWith('xxxx'))assert.equal(colored[n][0].kind,'string');
  }
  assert.equal(JSON.stringify(instruction),original);assert.equal(keyenceInstructionCopyText(instruction,program),copy);
  const target=parse(opcode,code.map(line=>line==='IF DummyReady THEN'?'IF DummyOther THEN':line));
  const comparison=compareKeyencePrograms(program,target),changed=comparison.source.instructions.find(i=>i.st)!;
  assert.deepEqual([...keyenceStChangedLines(changed)],[instruction.st!.lines[0].sourceLine]);
 }
});
