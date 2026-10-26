import test from 'node:test';
import assert from 'node:assert/strict';
import {parseKeyenceMnm} from '../src/keyence/parser.ts';
import {buildKeyenceNetworks} from '../src/keyence/logic.ts';
import {layoutKeyenceNetwork} from '../src/keyence/layout.ts';
import {keyenceOutputStyle} from '../src/keyence/outputStyle.ts';
import {keyenceInstructionCopyText} from '../src/keyence/instructionCopy.ts';
import {compareKeyencePrograms,keyenceComparisonDrawings} from '../src/keyence/comparison.ts';
import {CELL} from '../src/ladderMetrics.ts';
const program=(lines:string[],comments:Record<string,string>={})=>parseKeyenceMnm(new TextEncoder().encode(['DEVICE:99',...lines].join('\n')).buffer,'synthetic.mnm',comments);

test('native KEYENCE output symbols place device, preset and operation in separate fields',()=>{
 const p=program(['TMR #7 #30','OUTC #8 #5','SET MR1','RES C8','LDA.S DM100','STA.F DM110','FLOAT.S','ROUND.S','TBCD','TBIN','NEG','EXT.S']);
 const styles=p.instructions.map(keyenceOutputStyle);
 assert.deepEqual(styles.map(s=>s.kind),['timer','counter','labeled-coil','labeled-coil','calculation','calculation','calculation','calculation','calculation','calculation','calculation','application']);
 assert.deepEqual(styles.slice(0,4).map(s=>[s.body,s.above,s.bodyOperand,s.aboveOperand]),[
  ['T7','#30',0,1],['C8','#5',0,1],['SET','MR1',undefined,0],['RES','C8',undefined,0]]);
 assert.equal(styles[4].body,'LDA.S');assert.equal(styles[4].above,'DM100');
 const typed=program(['TMR T7 #30','OUTC C8 #5']).instructions.map(keyenceOutputStyle);
 assert.deepEqual(typed.map(s=>s.body),['T7','C8']);
 const typedProgram=program(['TMR T7 #30','OUTC C8 #5'],{'T7':'timer','C8':'counter'});
 assert.equal(keyenceInstructionCopyText(typedProgram.instructions[0],typedProgram),'TMR T7 #30\r\nT7: timer');
 assert.equal(keyenceInstructionCopyText(typedProgram.instructions[1],typedProgram),'OUTC C8 #5\r\nC8: counter');
});

test('unconfirmed variants and multioperand calculations retain their full command text',()=>{
 const p=program(['CAL+.S DM100 +2 DM110','LDA.X DM100','EXT.S DM100','TMR #0 #30 #40','FLOAT.S DM100','CUSTOM DM1 DM2']);
 for(const instruction of p.instructions){
  const style=keyenceOutputStyle(instruction);assert.equal(style.kind,'command');
  assert.equal(style.body,[instruction.opcode,...instruction.operands].join(' '));
 }
});

test('narrow native symbols preserve conditions, independent KEEP inputs and raw copy text',()=>{
 const p=program(['LD MR1','TMR #7 #30','OUTC #8 #5','RES T7','LDA.S DM100','FLOAT.S','STA.F DM110','LD MR2','LD MR3','KEEP MR20','END'],{'T7':'timer','C8':'counter'});
 const before=structuredClone(p),networks=buildKeyenceNetworks(p),drawings=networks.map(n=>layoutKeyenceNetwork(n,p)),symbols=drawings.flatMap(d=>d.symbols);
 assert.deepEqual(p,before);
 for(const symbol of symbols)assert.equal(symbol.width,CELL);
 const keep=symbols.find(s=>s.kind==='keep')!;
 assert.deepEqual(keep.ports?.map(port=>port.name),['SET','RES']);
 const d=drawings.find(d=>d.symbols.includes(keep))!;
 for(const port of keep.ports!)assert.ok(d.wires.some(w=>w.x2===keep.x&&w.y1===port.y&&w.y2===port.y));
 assert.equal(keyenceInstructionCopyText(p.instructions.find(i=>i.opcode==='TMR')!,p),'TMR #7 #30\r\nT7: timer');
 assert.equal(keyenceInstructionCopyText(p.instructions.find(i=>i.opcode==='OUTC')!,p),'OUTC #8 #5\r\nC8: counter');
});

test('preset-only changes retain the same connections after dedicated symbols are laid out',()=>{
 const source=program(['LD MR1','TMR #7 #30','OUTC #8 #5','LD MR2','LD MR3','KEEP MR20','END']);
 const target=program(['LD MR1','TMR #7 #40','OUTC #8 #6','LD MR2','LD MR3','KEEP MR20','END']);
 const result=compareKeyencePrograms(source,target);
 assert.deepEqual(result.changes.map(c=>c.source?.difference?.operandChanges),[[1],[1]]);
 for(const mode of ['wrap','scroll'] as const)for(const group of keyenceComparisonDrawings(result,true,mode)){
  for(const d of [...group.source,...group.target]){
   assert.ok(d.wires.every(w=>!w.difference));
   assert.ok(d.symbols.every(s=>!s.inputDifference&&!s.outputDifference));
  }
 }
});