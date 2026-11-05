import test from 'node:test';
import assert from 'node:assert/strict';
import {blockRangeMenu,blockRangeText,comparisonRangeText} from '../src/blockRangeCopy.ts';
import {parseProgram} from '../src/model.ts';
import {parseKeyenceMnm} from '../src/keyence/parser.ts';
import {buildKeyenceNetworks} from '../src/keyence/logic.ts';
import {projectMitsubishiInstruction} from '../src/mitsubishiCompareDrawing.tsx';
import {projectKeyenceInstruction} from '../src/keyence/compareDrawing.tsx';

test('STEP ranges cover the whole circuit block, including zero and its last output',()=>{
 const p=parseProgram('ステップ番号\t命令\tI/O(デバイス)\n0\tLD\tX0\n1\tMPS\n2\tAND\tX1\n3\tOUT\tY1\n4\tMPP\n5\tAND\tX2\n6\tOUT\tY2\n10\tLD\tX3\n11\tOUT\tY3','range.csv');
 assert.equal(p.networks.length,2);
 assert.equal(blockRangeText([p.networks[0]]),'STEP 0～6');
 assert.equal(blockRangeText([p.networks[1]]),'STEP 10～11');
 assert.equal(blockRangeText([{instructions:p.networks[0].instructions.map(i=>projectMitsubishiInstruction(i,{}))}]),'STEP 0～6');
 assert.equal(blockRangeText([{instructions:[{step:''},{step:'184'},{step:'192'},{step:''}]}]),'STEP 184～192');
 assert.equal(blockRangeText([{instructions:[{step:'0'}]}]),'STEP 0～0');
 assert.equal(blockRangeText([]),'');
});

test('comparison ranges keep each sides own steps and label an absent side',()=>{
 assert.equal(comparisonRangeText('STEP 184～192','STEP 180～187'),'比較元 STEP 184～192\r\n比較先 STEP 180～187');
 assert.equal(comparisonRangeText('STEP 0～6',''),'比較元 STEP 0～6\r\n比較先 （なし）');
 assert.equal(comparisonRangeText('',''),'');
});

test('KEYENCE copies original file line ranges rather than inventing STEP numbers',()=>{
 const p=parseKeyenceMnm(new TextEncoder().encode('DEVICE:99\nLD R0\n\nAND R1\nOUT MR0\nLD R2\nOUT MR1').buffer,'range.mnm');
 const networks=buildKeyenceNetworks(p);
 assert.equal(blockRangeText([networks[0]]),'元ファイル 2～5行');
 assert.equal(blockRangeText([{instructions:networks[0].instructions.map(i=>projectKeyenceInstruction(i,p))}]),'元ファイル 2～5行');
 assert.equal(blockRangeText([networks[1]]),'元ファイル 6～7行');
});

test('right-click opens the existing native Copy menu with only the block range',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'window');
 const messages:unknown[]=[];
 Object.defineProperty(globalThis,'window',{configurable:true,value:{chrome:{webview:{postMessage:(message:unknown)=>messages.push(message)}}}});
 try{
  let prevented=0,stopped=0;
  const event={preventDefault:()=>prevented++,stopPropagation:()=>stopped++} as MouseEvent;
  blockRangeMenu(event,'STEP 184～192');
  assert.deepEqual(messages,[{type:'instruction-menu',text:'STEP 184～192'}]);
  assert.equal(prevented,1);assert.equal(stopped,1);
  blockRangeMenu(event,'');assert.equal(messages.length,1);
 }finally{
  if(original)Object.defineProperty(globalThis,'window',original);else Reflect.deleteProperty(globalThis,'window');
 }
});
