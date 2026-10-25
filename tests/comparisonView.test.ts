import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProgram} from '../src/model.ts';
import {gridLayout,SCROLLBAR_HEIGHT} from '../src/layout.ts';
import {drawingHeight} from '../src/NetworkDrawing.tsx';
import {adjacentDifferenceBlock,comparisonBlockSize,differenceSummary} from '../src/ComparisonView.tsx';

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

test('difference navigation moves between circuit blocks relative to the block at the top of the view',()=>{
 const d=[{}];
 // Blocks 0..5 are 100px tall; blocks 1, 3 and 4 have differences.
 const blocks=[[],d,[],d,d,[]].map((changes,index)=>({top:index*100,changes}));
 assert.equal(adjacentDifferenceBlock(blocks,0,1),1);
 assert.equal(adjacentDifferenceBlock(blocks,100,1),3,'the block already at the top is skipped');
 assert.equal(adjacentDifferenceBlock(blocks,250,1),3,'inside block 2, the next block below follows');
 assert.equal(adjacentDifferenceBlock(blocks,350,1),4,'inside block 3, the next difference block follows');
 assert.equal(adjacentDifferenceBlock(blocks,450,1),1,'past the last difference it wraps to the first');
 assert.equal(adjacentDifferenceBlock(blocks,350,-1),3,'inside block 3, previous returns to its start above the view');
 assert.equal(adjacentDifferenceBlock(blocks,300,-1),1);
 assert.equal(adjacentDifferenceBlock(blocks,50,-1),4,'before the first difference it wraps to the last');
 // Near the end the view cannot scroll to block 4's top; the last jump target is used while the view is unmoved.
 assert.equal(adjacentDifferenceBlock(blocks,320,1,4),1);
 assert.equal(adjacentDifferenceBlock(blocks,320,-1,4),3);
 assert.equal(adjacentDifferenceBlock([{top:0,changes:[]}],0,1),-1);
});

test('difference summary counts rows by kind in first-seen order',()=>{
 const change=(kind:'changed'|'added'|'removed')=>({sourceRow:0,alignmentRow:0,sourceText:'',targetText:'',sourceStep:'',targetStep:'',kind});
 assert.equal(differenceSummary([change('changed'),change('added'),change('changed')]),'変更2・追加1');
});
