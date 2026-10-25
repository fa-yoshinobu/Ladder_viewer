import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProgram} from '../src/model.ts';
import {parseComparison} from '../src/comparison.ts';
import {isPointerDefinition} from '../src/instructions.ts';
import {gridLayout} from '../src/layout.ts';
import {instructionCopyText} from '../src/instructionCopy.ts';

function program(commands:string[]) {
 return parseProgram('ステップ番号\t命令\tI/O(デバイス)\n'+commands.map((command,index)=>index+'\t'+command).join('\n'),'synthetic.csv');
}

test('GLP number definitions use the existing pointer classification without broad prefix matches',()=>{
 for(const op of ['GLP0','GLP81','P0','#P4','I27'])assert.equal(isPointerDefinition(op),true,op);
 for(const op of ['GLP','GLP-1','GLPX0','GLP0X','#GLP0'])assert.equal(isPointerDefinition(op),false,op);
});

test('a GLP definition labels the following rung and remains searchable and copyable as its original instruction',()=>{
 const p=program(['LD\tX8','CJ\tGLP7','GLP7','LD\tX9','OUT\tY8']);
 const definition=p.instructions.find(i=>i.op==='GLP7')!;
 const target=p.networks.find(n=>n.pointer===definition)!;
 assert.ok(target);
 assert.ok(!p.networks.flatMap(n=>gridLayout(n).symbols).some(s=>s.instruction===definition));
 assert.deepEqual(p.networks.flatMap(n=>n.instructions.map(i=>i.id)),p.instructions.map(i=>i.id));
 assert.equal(p.instructions.find(i=>i.op==='CJ')!.controlFlow?.targetId,definition.id);
 assert.equal(instructionCopyText(definition,{GLP7:'試験ラベル'}),'GLP7\r\nGLP7: 試験ラベル');
});

test('GLP0 and P0 stay separate and explicit JMPO labels resolve without guessing numeric offsets',()=>{
 const p=program(['GLP0','NOP','P0','NOP','CJ\tGLP0','JMP\t#P0','JMPO\tGLP0','JMPO\tK0']);
 const glp=p.instructions.find(i=>i.op==='GLP0')!,pointer=p.instructions.find(i=>i.op==='P0')!;
 const jumps=p.instructions.filter(i=>['CJ','JMP','JMPO'].includes(i.op));
 assert.equal(jumps[0].controlFlow?.targetId,glp.id);
 assert.equal(jumps[1].controlFlow?.targetId,pointer.id);
 assert.equal(jumps[2].controlFlow?.targetId,glp.id);
 assert.equal(jumps[3].controlFlow?.targetId,undefined);
 assert.equal(jumps[3].controlFlow?.label,'生成ジャンプ');
});

test('duplicate GLP definitions do not fall back to a same-number ordinary pointer',()=>{
 const p=program(['P0','NOP','GLP0','NOP','GLP00','NOP','JMP\tGLP0']);
 const jump=p.instructions.find(i=>i.op==='JMP')!;
 assert.equal(jump.controlFlow?.targetId,undefined);
 assert.ok(p.networks.flatMap(n=>n.warnings).some(w=>w.includes('一意のポインター')));
});

test('comparison sides resolve a GLP destination inside their own side',()=>{
 const rows=[['0','GLP0','10','GLP0'],['1','LD X8','11','LD X8'],['2','OUT Y8','12','OUT Y8'],['3','CJ GLP0','13','CJ GLP0']];
 const text='行\tステップ\t照合元\tステップ\t照合先\t照合結果\n'+rows.map((row,index)=>[String(index+1),...row,'一致'].join('\t')).join('\n');
 const source=parseComparison(text,'synthetic-comparison.csv'),target=source.comparison!.target;
 assert.equal(source.instructions.find(i=>i.op==='CJ')!.controlFlow?.targetId,source.instructions[0].id);
 assert.equal(target.instructions.find(i=>i.op==='CJ')!.controlFlow?.targetId,target.instructions[0].id);
 assert.equal(source.instructions.find(i=>i.op==='CJ')!.controlFlow?.targetStep,'0');
 assert.equal(target.instructions.find(i=>i.op==='CJ')!.controlFlow?.targetStep,'10');
 assert.equal(source.comparison!.differentRows,0);
});
