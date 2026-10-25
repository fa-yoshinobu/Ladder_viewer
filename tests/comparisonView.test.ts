import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProgram} from '../src/model.ts';
import {gridLayout,SCROLLBAR_HEIGHT} from '../src/layout.ts';
import {drawingHeight} from '../src/NetworkDrawing.tsx';
import {comparisonBlockSize} from '../src/ComparisonView.tsx';

function circuit(contacts:number,device:string){
 const commands=Array.from({length:contacts},(_,index)=>`${index}\t${index?'AND':'LD'}\tX${index}`);
 commands.push(`${contacts}\tOUT\t${device}`);
 return parseProgram('ステップ番号\t命令\tI/O(デバイス)\n'+commands.join('\n'),'synthetic.csv').networks[0];
}
test('short comparison groups keep their heights in both display modes',()=>{
 const group={source:[circuit(2,'Y0'),circuit(3,'Y1')],target:[circuit(1,'Y2')]};
 const wrapped=comparisonBlockSize(group,72,1,'wrap'),horizontal=comparisonBlockSize(group,72,1,'scroll');
 assert.equal(horizontal.sharedScroll,false);
 assert.deepEqual(horizontal,wrapped);
});
test('one-to-one comparisons use only the long circuits local scrollbar',()=>{
 const long=circuit(28,'Y0'),short=circuit(2,'Y1');
 assert.ok(gridLayout(long).pages>1);
 const size=comparisonBlockSize({source:[long],target:[short]},72,1,'scroll');
 assert.equal(size.sharedScroll,false);
 assert.equal(size.sourceHeight,drawingHeight(long,72,1,'scroll'));
 assert.equal(size.targetHeight,drawingHeight(short,72,1,'wrap'));
 assert.equal(size.height,Math.max(size.sourceHeight,size.targetHeight));
});
test('multi-network comparisons reserve one scrollbar at the group end without shifting following circuits',()=>{
 const group={source:[circuit(28,'Y0'),circuit(40,'Y1')],target:[circuit(3,'Y2'),circuit(2,'Y3')]};
 const before=JSON.stringify(group);
 const size=comparisonBlockSize(group,72,1,'scroll');
 const sourceCore=group.source.reduce((sum,n)=>sum+drawingHeight(n,72,1,'scroll',false),0);
 const targetCore=group.target.reduce((sum,n)=>sum+drawingHeight(n,72,1,'scroll',false),0);
 assert.equal(size.sharedScroll,true);
 assert.equal(size.sourceHeight,sourceCore+SCROLLBAR_HEIGHT);
 assert.equal(size.targetHeight,targetCore+SCROLLBAR_HEIGHT);
 assert.equal(size.height,Math.max(sourceCore,targetCore)+SCROLLBAR_HEIGHT);
 assert.equal(JSON.stringify(group),before);
});
