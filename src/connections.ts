import type {Network} from './model';
import {gridLayout,type GridWire} from './layout';

interface Point {x:number;y:number}
interface Terminal {point:number;key:string;instruction:string;input:boolean}
const onWire=(point:Point,wire:GridWire)=>wire.x1===wire.x2
 ? point.x===wire.x1&&point.y>=Math.min(wire.y1,wire.y2)&&point.y<=Math.max(wire.y1,wire.y2)
 : point.y===wire.y1&&point.x>=Math.min(wire.x1,wire.x2)&&point.x<=Math.max(wire.x1,wire.x2);

function connectionNets(network:Network){
 const grid=gridLayout(network),points:Point[]=[],indices=new Map<string,number>(),terminals:Terminal[]=[];
 const point=(x:number,y:number)=>{const key=`${x}:${y}`;let index=indices.get(key);if(index===undefined){index=points.length;points.push({x,y});indices.set(key,index);}return index;};
 for(const symbol of grid.symbols){
  const id=symbol.instruction.comparisonRow??symbol.instruction.id;
  terminals.push({point:point(symbol.col,symbol.row),key:`${id}:in`,instruction:symbol.instruction.id,input:true});
  // Output return terminals always join the right rail and do not affect the rung condition.
  if(symbol.contact)terminals.push({point:point(symbol.col+symbol.span,symbol.row),key:`${id}:out`,instruction:symbol.instruction.id,input:false});
 }
 for(const wire of grid.wires){point(wire.x1,wire.y1);point(wire.x2,wire.y2);}
 const horizontal=grid.wires.filter(w=>w.y1===w.y2),vertical=grid.wires.filter(w=>w.x1===w.x2);
 for(const h of horizontal)for(const v of vertical){const crossing={x:v.x1,y:h.y1};if(onWire(crossing,h)&&onWire(crossing,v))point(crossing.x,crossing.y);}
 const parents=points.map((_,index)=>index);
 const find=(index:number):number=>parents[index]===index?index:(parents[index]=find(parents[index]));
 const union=(a:number,b:number)=>{parents[find(a)]=find(b);};
 for(const wire of grid.wires){const first=point(wire.x1,wire.y1);points.forEach((p,index)=>{if(onWire(p,wire))union(first,index);});}
 const rail=points.flatMap((p,index)=>p.x===0?[index]:[]);
 for(const index of rail.slice(1))union(rail[0],index);
 const railRoot=rail.length?find(rail[0]):-1;
 const members=new Map<number,Set<string>>();
 for(const terminal of terminals){const root=find(terminal.point);if(!members.has(root))members.set(root,new Set());members.get(root)!.add(terminal.key);}
 const signatures=new Map([...members].map(([root,keys])=>[root,root===railRoot?'rail':JSON.stringify([...keys].sort())]));
 const railKeys=members.get(railRoot)??new Set<string>();
 return {network,grid,points,terminals,find,railRoot,railKeys,signatures};
}

export function compareConnections(source:Network[],target:Network[]):void {
 // Compare terminal membership, so padding rows and longer routed lines do not create differences.
 const sides=[source.map(connectionNets),target.map(connectionNets)];
 for(let side=0;side<2;side++){
  const other=sides[1-side];
  const otherSignatures=new Set(other.flatMap(net=>[...net.signatures.values()]));
  const otherRailKeys=new Set(other.flatMap(net=>[...net.railKeys]));
  for(const net of sides[side]){
   const changed=(root:number)=>root!==net.railRoot&&net.signatures.has(root)&&!otherSignatures.has(net.signatures.get(root)!);
   const inputs:string[]=[],outputs:string[]=[];
   for(const terminal of net.terminals){const root=net.find(terminal.point);if(changed(root)||(root===net.railRoot&&!otherRailKeys.has(terminal.key)))(terminal.input?inputs:outputs).push(terminal.instruction);}
   const wires=net.grid.wires.flatMap((wire,index)=>{
    const root=net.find(net.points.findIndex(p=>p.x===wire.x1&&p.y===wire.y1));
    if(changed(root))return[index];
    // Keep the shared mother rail unchanged; highlight only a new/deleted branch leaving it.
    if(root===net.railRoot&&wire.y1===wire.y2&&net.terminals.some(t=>onWire(net.points[t.point],wire)&&!otherRailKeys.has(t.key)))return[index];
    return[];
   });
   net.network.connectionDifferences={kind:side===0?'removed':'added',wires,inputs,outputs};
  }
 }
}