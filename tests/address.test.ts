import test from 'node:test';
import assert from 'node:assert/strict';
import { addressParts } from '../src/address.ts';
const indices = (text: string) => addressParts(text).filter(p => p.index).map(p => p.text);
test('index suffix includes the full Z/LZ register number and keeps the base address',()=>{
 assert.deepEqual(addressParts('D100Z0'),[{text:'D100',index:false},{text:'Z0',index:true}]);
 assert.deepEqual(addressParts('D100LZ12'),[{text:'D100',index:false},{text:'LZ12',index:true}]);
 assert.deepEqual(indices('Z0'),['Z0']); assert.deepEqual(indices('LZ0'),['LZ0']);
 assert.deepEqual(indices('K1Z8'),['Z8']);
 assert.deepEqual(indices('U5Z6\\G240Z7'),['Z6','Z7']);
});
test('ZR devices, named labels and strings do not become index modifiers',()=>{
 for(const text of ['ZR8400','test_Z_Buffer[0]','myLabelZ0','"D100Z0"','ZERO'])assert.deepEqual(indices(text),[],text);
 for(const text of ['D100Z0','D100LZ12','U5Z6\\G240Z7','ZR8400'])assert.equal(addressParts(text).map(p=>p.text).join(''),text);
});
