import test from 'node:test';
import assert from 'node:assert/strict';
import {fitLadderZoom,LADDER_WIDTH} from '../src/layout.ts';

test('normal fit reserves the existing 24px margin and rounds down to two decimals',()=>{
 assert.equal(fitLadderZoom(LADDER_WIDTH+24,false),1);
 assert.equal(fitLadderZoom(1000,false),0.98);
 assert.equal(fitLadderZoom(LADDER_WIDTH*0.837+24,false),0.83);
});

test('comparison fit reserves navigation width and fits each half with the same margin',()=>{
 assert.equal(fitLadderZoom(170+2*(LADDER_WIDTH+24),true),1);
 assert.equal(fitLadderZoom(1800,true),0.8);
 assert.equal(fitLadderZoom(1800,false),1.5);
});

test('fit preserves normal and comparison minimum zoom and the shared maximum',()=>{
 assert.equal(fitLadderZoom(200,false),0.5);
 assert.equal(fitLadderZoom(300,true),0.25);
 assert.equal(fitLadderZoom(10000,false),1.5);
 assert.equal(fitLadderZoom(10000,true),1.5);
});
