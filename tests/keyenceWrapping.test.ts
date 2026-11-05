import test from 'node:test';
import assert from 'node:assert/strict';
import {parseKeyenceMnm} from '../src/keyence/parser.ts';
import {buildKeyenceNetworks} from '../src/keyence/logic.ts';
import {keyenceViewDrawing,layoutKeyenceNetwork} from '../src/keyence/layout.ts';
import {CELL,ROW,COMMENT_ROW,COLUMNS,GRID_WIDTH,LEFT_GUTTER,LADDER_WIDTH,BASELINE,PAGE_GAP} from '../src/ladderMetrics.ts';
import {continuationText} from '../src/continuation.ts';
import {placeSymbolColumn} from '../src/ladderGeometry.ts';

const drawing=(lines:string[],showComments=true)=>{
 const bytes=new TextEncoder().encode(['DEVICE:99',';MODULE:SyntheticWrap',';MODULE_TYPE:0',...lines].join('\r\n'));
 const p=parseKeyenceMnm(bytes.buffer,'synthetic-wrap.mnm');
 return layoutKeyenceNetwork(buildKeyenceNetworks(p)[0],p,showComments);
};
const contacts=(count:number)=>Array.from({length:count},(_,index)=>(index?'AND':'LD')+' MR'+(index+1));
const captions=(value:ReturnType<typeof keyenceViewDrawing>)=>value.continuationLabels??[];

test('Keyence ordinary symbols use the shared Mitsubishi cell, row and rail dimensions',()=>{
 const base=drawing(['LD MR1 ; synthetic comment','OUT MR20']),hidden=drawing(['LD MR1 ; synthetic comment','OUT MR20'],false);
 assert.equal(base.width,LADDER_WIDTH);assert.equal(base.left,LEFT_GUTTER);
 assert.equal(base.right,LEFT_GUTTER+GRID_WIDTH+8);assert.equal(base.baseline,BASELINE);
 assert.equal(base.rowHeight,COMMENT_ROW);assert.equal(hidden.rowHeight,ROW);
 assert.equal(drawing(['LD MR1','OUT MR20']).rowHeight,ROW,'a comment-free program keeps the ordinary Mitsubishi row height');
 assert.equal(base.height,COMMENT_ROW);assert.equal(hidden.height,ROW);
 assert.equal(base.symbols[0].x,LEFT_GUTTER);assert.equal(base.symbols[0].y,BASELINE);assert.equal(base.symbols[0].width,CELL);
 const coil=base.symbols.find(symbol=>symbol.kind==='coil')!;
 assert.equal(coil.width,CELL);assert.equal(coil.x+coil.width,base.right-8);
 assert.ok(base.wires.some(wire=>wire.x1===base.right-8&&wire.x2===base.right&&wire.y1===coil.y&&wire.y2===coil.y));
 const command=drawing(['LD MR1','MOV DM100 DM200']).symbols.find(symbol=>symbol.kind==='command')!;
 const comparison=drawing(['LD= DM100 #1','OUT MR20']).symbols.find(symbol=>symbol.kind==='comparison')!;
 assert.equal(command.width,2*CELL);assert.equal(comparison.width,CELL);
});

test('short Keyence circuits keep the identical drawing object in both display modes',()=>{
 const base=drawing(['LD MR1','OUT MR20']),before=structuredClone(base);
 assert.equal(keyenceViewDrawing(base,'wrap'),base);
 assert.equal(keyenceViewDrawing(base,'scroll'),base);
 assert.deepEqual(base,before);
});

test('horizontal scroll preserves a long Keyence drawing without changing any coordinates',()=>{
 const base=drawing([...contacts(15),'OUT MR20']),before=structuredClone(base);
 assert.ok(base.width>LADDER_WIDTH);
 assert.equal(keyenceViewDrawing(base,'scroll'),base);
 assert.deepEqual(base,before);
});

test('wrapping moves symbols and search coordinates while retaining source identities and common continuation captions',()=>{
 const base=drawing([...contacts(15),'OUT MR20']),before=structuredClone(base);
 const wrapped=keyenceViewDrawing(base,'wrap');
 assert.equal(wrapped.network,base.network);assert.equal(wrapped.network.instructions,base.network.instructions);
 assert.equal(wrapped.symbols.length,base.symbols.length);assert.equal(wrapped.width,LADDER_WIDTH);
 assert.equal(wrapped.right,LEFT_GUTTER+GRID_WIDTH+8);
 assert.deepEqual(captions(wrapped).map(label=>label.text),[continuationText(0,2),continuationText(1,2)]);
 const pageOffset=captions(wrapped)[1].y-captions(wrapped)[0].y;
 for(const original of base.symbols){
  const placed=wrapped.symbols.find(symbol=>symbol.instruction===original.instruction)!;
  assert.ok(placed);assert.equal(placed.width,original.width);
  if(original.kind==='coil'){
   assert.equal(placed.x,wrapped.right-8-CELL);assert.equal(placed.y,original.y+pageOffset);
  }else if(original.x>=base.left+GRID_WIDTH){
   assert.equal(placed.x,original.x-GRID_WIDTH);assert.equal(placed.y,original.y+pageOffset);
  }else{assert.equal(placed.x,original.x);assert.equal(placed.y,original.y);}
  assert.ok(placed.x>=wrapped.left&&placed.x+placed.width<=wrapped.right-8);
 }
 assert.deepEqual(base,before);
});

test('a two-cell native command crossing a page cut stays intact and its output remains at the fixed right rail',()=>{
 const base=drawing([...contacts(11),'MOV DM100 DM200']);
 const command=base.symbols.find(symbol=>symbol.kind==='command')!;
 assert.equal(command.x,base.left+11*CELL);assert.equal(command.width,2*CELL);
 const wrapped=keyenceViewDrawing(base,'wrap'),placed=wrapped.symbols.find(symbol=>symbol.instruction===command.instruction)!;
 assert.equal(captions(wrapped).length,2);assert.equal(placed.x,wrapped.left+10*CELL);
 assert.equal(wrapped.width,LADDER_WIDTH);assert.equal(placed.x+placed.width,wrapped.right-8);
 assert.equal(wrapped.rails?.at(-1)?.x,wrapped.right);
 assert.ok(wrapped.wires.some(wire=>wire.x1===wrapped.left&&wire.x2===placed.x&&wire.y1===placed.y&&wire.y2===placed.y));
 assert.ok(wrapped.wires.some(wire=>wire.x1===wrapped.right-8&&wire.x2===wrapped.right&&wire.y1===placed.y&&wire.y2===placed.y));
 assert.equal(placed.width,command.width);assert.ok(placed.y>command.y);
});

test('a vertical branch on a page cut is retained once with continued input lines and no artificial input rail',()=>{
 const base=drawing([...contacts(12),'OR MR30','AND MR31','AND MR32','OUT MR40']);
 const cut=base.left+GRID_WIDTH,branch=base.wires.find(wire=>wire.x1===cut&&wire.x2===cut&&wire.y1!==wire.y2)!;
 assert.ok(branch);
 const wrapped=keyenceViewDrawing(base,'wrap'),pages=captions(wrapped),dy=pages[1].y-pages[0].y,inputX=wrapped.left;
 assert.equal(pages.length,2);
 assert.ok(wrapped.wires.some(wire=>wire.x1===inputX&&wire.x2===inputX&&wire.y1===branch.y1+dy&&wire.y2===branch.y2+dy));
 assert.ok(!wrapped.wires.some(wire=>wire.x1===cut&&wire.x2===cut&&wire.y1===branch.y1&&wire.y2===branch.y2));
 assert.equal(wrapped.rails?.length,2);assert.equal(wrapped.rails?.[0].x,base.left);
 assert.equal(wrapped.rails?.[0].top,base.railTop);assert.ok(wrapped.rails![1].top>=dy);
 assert.ok(pages.every(page=>!/^→ \d+$/.test(page.text)&&!/^\d+ →$/.test(page.text)));
});

test('KEEP keeps its special two-input height while both independently wired ports move with the page',()=>{
 const base=drawing([...contacts(14),'LD MR50','KEEP MR60']),before=structuredClone(base);
 const keep=base.symbols.find(symbol=>symbol.kind==='keep')!;
 assert.deepEqual(keep.ports?.map(port=>port.name),['SET','RES']);assert.equal(keep.width,CELL);
 const wrapped=keyenceViewDrawing(base,'wrap'),placed=wrapped.symbols.find(symbol=>symbol.kind==='keep')!,dy=placed.y-keep.y;
 assert.ok(dy>0);assert.equal(placed.width,keep.width);assert.equal(placed.height,keep.height);
 assert.deepEqual(placed.ports,keep.ports!.map(port=>({...port,y:port.y+dy})));
 for(const port of placed.ports!)assert.ok(wrapped.wires.some(wire=>wire.y1===port.y&&wire.y2===port.y&&wire.x2===placed.x));
 assert.equal(wrapped.network,base.network);assert.deepEqual(base,before);
});

test('an exceptionally wide single command expands its page instead of being clipped',()=>{
 const base=drawing(['LD MR1','CUSTOM_'+ 'X'.repeat(180)+' DM100']);
 const command=base.symbols.find(symbol=>symbol.kind==='command')!;
 assert.ok(command.width>GRID_WIDTH);
 const wrapped=keyenceViewDrawing(base,'wrap'),placed=wrapped.symbols.find(symbol=>symbol.instruction===command.instruction)!;
 assert.equal(placed.width,command.width);assert.equal(placed.x,wrapped.left);
 assert.ok(placed.x+placed.width<=wrapped.right-8);
 assert.equal(wrapped.symbols.filter(symbol=>symbol.instruction===command.instruction).length,1);
});

test('common page captions occupy the footer gap on every page including the final page',()=>{
 const base=drawing([...contacts(15),'OUT MR20']);
 const wrapped=keyenceViewDrawing(base,'wrap'),pages=captions(wrapped),step=base.height-base.headerHeight+PAGE_GAP;
 assert.equal(pages.length,2);assert.equal(pages[0].y,base.railBottom+15);
 assert.equal(pages[1].y,base.railBottom+step+15);
 assert.equal(wrapped.height-pages[1].y,PAGE_GAP-15);
 assert.ok(pages.every(page=>wrapped.symbols.every(symbol=>page.y!==symbol.y-17)));
});

test('the shared safe-column rule advances only symbols that would cross a page',()=>{
 assert.equal(placeSymbolColumn(0,3,COLUMNS),0);
 assert.equal(placeSymbolColumn(9,3,COLUMNS),9);
 assert.equal(placeSymbolColumn(11,3,COLUMNS),12);
 assert.equal(placeSymbolColumn(12,3,COLUMNS),12);
 assert.equal(placeSymbolColumn(23,2,COLUMNS),24);
});

test('staggered parallel comparisons with long labels stay inside twelve columns without cutting symbols or changing the model',()=>{
 const lines=['LD MR1','LD MR2','AND MR3',
  ...Array.from({length:6},(_,index)=>`AND= SyntheticComparisonValue${100+index} #0`),
  'LD= SyntheticComparisonValue200 #0',...Array.from({length:6},(_,index)=>`AND= SyntheticComparisonValue${201+index} #0`),
  'ORL','ANL','OUT MR40'];
 const base=drawing(lines),before=structuredClone(base),wrapped=keyenceViewDrawing(base,'wrap');
 assert.ok(base.width>LADDER_WIDTH);assert.equal(wrapped.width,LADDER_WIDTH);
 assert.equal(wrapped.network,base.network);assert.equal(wrapped.network.instructions,base.network.instructions);
 assert.equal(wrapped.symbols.length,base.symbols.length);
 assert.ok(wrapped.symbols.every(symbol=>symbol.x>=wrapped.left&&symbol.x+symbol.width<=wrapped.right-8));
 assert.deepEqual(wrapped.symbols.map(symbol=>symbol.instruction.id).sort(),base.symbols.map(symbol=>symbol.instruction.id).sort());
 const comparisons=wrapped.symbols.filter(symbol=>symbol.kind==='comparison');
 assert.equal(comparisons.length,13);assert.ok(comparisons.every(symbol=>symbol.width===3*CELL));
 assert.deepEqual(base,before);assert.equal(keyenceViewDrawing(base,'scroll'),base);
});

test('wrap-only command packing keeps a CON chain ordered with every command inside one page',()=>{
 const base=drawing(['LD MR1','LDA DM100','CON','CAL+ DM100 #1 DM101','CON','MOV DM101 DM102','CON','CAL* DM102 #2 DM103','CON','STA DM104']);
 const before=structuredClone(base),wrapped=keyenceViewDrawing(base,'wrap');
 const commands=wrapped.symbols.filter(symbol=>symbol.kind==='command'||symbol.kind==='calculation');
 assert.equal(wrapped.width,LADDER_WIDTH);
 assert.deepEqual(commands.map(symbol=>symbol.instruction.opcode),['LDA','CAL+','MOV','CAL*','STA']);
 assert.ok(commands.every(symbol=>symbol.x>=wrapped.left&&symbol.x+symbol.width<=wrapped.right-8));
 assert.equal(commands.at(-1)!.x+commands.at(-1)!.width,wrapped.right-8);
 assert.equal(wrapped.network,base.network);assert.deepEqual(base,before);
});
