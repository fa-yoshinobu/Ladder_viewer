import test from 'node:test';
import assert from 'node:assert/strict';
import {parseKeyenceMnm} from '../src/keyence/parser.ts';
import {findKeyenceLegacyScriptRegions} from '../src/keyence/legacyScript.ts';

// Original dummy programs; no external program source or identifiers are included.
const parse=(lines:string[])=>parseKeyenceMnm(new TextEncoder().encode(['DEVICE:52',';MODULE:DummyScript',';SCRIPT_TYPE:',...lines].join('\r\n')).buffer,'dummy-script.mnm');
const simple=(label='#731',source='\tDummyTotal = DummyInput + #17')=>[
 ';'+source,'LD MR730','NCJ '+label,';'+source,'LD CR2002','LDA DM731','CON','ADD #17','CON','STA DM732','LABEL '+label,
];

test('legacy script recognition preserves source whitespace, adjacent notes and every original instruction',()=>{
 const p=parse([';Dummy section',...simple(),'LD MR733','OUT MR734']),before=JSON.stringify(p),regions=findKeyenceLegacyScriptRegions(p);
 assert.equal(regions.length,1);
 const r=regions[0];
 assert.deepEqual([r.guardStartIndex,r.jumpIndex,r.endIndex],[0,1,8]);
 assert.equal(r.leadingStatement,'Dummy section');
 assert.deepEqual(r.sourceLines,[{sourceLine:5,raw:';\tDummyTotal = DummyInput + #17',text:'\tDummyTotal = DummyInput + #17'}]);
 assert.equal(p.instructions[r.endIndex+1].opcode,'LD');
 assert.equal(JSON.stringify(p),before);
 assert.equal(findKeyenceLegacyScriptRegions(p)[0].id,r.id);
});

test('nested branches, blank source lines, compiler warnings and chained guards stay within one script',()=>{
 const source=["'Dummy calculation",'if DummyReady then','\tDummyTotal = #23','','else','\tDummyTotal = #29','end if'];
 const p=parse([...source.map(s=>';'+s),'LD MR740','ANB MR741','OR MR742','NCJ #741',
  ';'+source[0],';',';'+source[1],'LD MR743','NCJ #742',';'+source[2],';;Warning[1201]: dummy warning',
  'LD CR2002','MOV #23 DM744',';else','LD CR2002','CJ #743','LABEL #742',';'+source[5],
  'LD CR2002','MOV #29 DM744',';end if','LABEL #743','LABEL #741','LD MR745','OUT MR746']);
 const [r,...others]=findKeyenceLegacyScriptRegions(p);
 assert.ok(r);assert.deepEqual(others,[]);assert.equal(r.guardStartIndex,0);assert.equal(r.jumpIndex,3);
 assert.deepEqual(r.sourceLines.map(line=>line.text),source);
 assert.equal(p.instructions[r.endIndex].raw,'LABEL #741');
 assert.equal(p.instructions[r.endIndex+1].raw,'LD MR745');
});

test('separate scripts do not capture the circuit between them or metadata',()=>{
 const p=parse([...simple(),'LD MR750','OUT MR751',...simple('#752','DummyOther = #31')]);
 const regions=findKeyenceLegacyScriptRegions(p);
 assert.equal(regions.length,2);assert.notEqual(regions[0].id,regions[1].id);
 assert.equal(regions[0].leadingStatement,'');assert.equal(regions[0].sourceLines.length,1);
 assert.equal(p.instructions[regions[0].endIndex+1].raw,'LD MR750');
 assert.equal(regions[1].guardStartIndex,regions[0].endIndex+3);
});

test('ordinary comments, incomplete source, missing metadata and non-load guards remain ladder',()=>{
 const cases=[
  simple().map(line=>line.replace('DummyTotal = DummyInput + #17','A repeated ordinary note')),
  simple().map((line,index)=>index===3?';DummyTotal = #99':line),
  simple().filter(line=>line!=='LABEL #731'),
  simple().map(line=>line==='LD MR730'?'LDA DM730':line),
  [...simple().slice(0,-1),'END','LABEL #731'],
  [...simple().slice(0,-1),';unrelated following circuit','LD MR760','OUT MR761','LABEL #731'],
 ];
 for(const lines of cases)assert.deepEqual(findKeyenceLegacyScriptRegions(parse(lines)),[]);
 const withoutMetadata=parse(simple());withoutMetadata.metadata=withoutMetadata.metadata.filter(m=>m.key!=='SCRIPT_TYPE');
 assert.deepEqual(findKeyenceLegacyScriptRegions(withoutMetadata),[]);
});

test('ambiguous labels and jumps crossing script boundaries prevent folding',()=>{
 for(const lines of [
  [...simple(),'LABEL #731'],
  ['LD MR770','CJ #731',...simple()],
  [...simple().slice(0,-1),'CJ #772','LABEL #731','LABEL #772'],
  ['LD MR770','CJ #773',...simple().slice(0,-1),'LABEL #773','LABEL #731'],
  [...simple().slice(0,-1),'NCJ #774','LABEL #731'],
 ])assert.deepEqual(findKeyenceLegacyScriptRegions(parse(lines)),[]);
});

test('source is not inferred when an exporter omits part of the repeated script',()=>{
 const source=['if DummyFlag then','DummyValue = #41','else','DummyValue = #43','end if'];
 const p=parse([...source.map(s=>';'+s),'LD MR780','NCJ #781',
  ...source.filter(s=>s!=='else').map(s=>';'+s),'LD CR2002','MOV #41 DM782','LABEL #781']);
 assert.deepEqual(findKeyenceLegacyScriptRegions(p),[]);
});
