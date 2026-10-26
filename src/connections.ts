import {isControlMarker} from './controlFlow';
import type {Network} from './model';
import {gridLayout} from './layout';
import {compareConnectionGraphs,type ConnectionInput,type ConnectionTerminal} from './connectionGraph';
export function compareConnections(source:Network[],target:Network[]):void {
 const describe=(network:Network):ConnectionInput=>{
  const grid=gridLayout(network),terminals:ConnectionTerminal[]=[];
  for(const symbol of grid.symbols){
   if(isControlMarker(symbol.instruction.op))continue;
   const id=symbol.instruction.comparisonRow??symbol.instruction.id;
   terminals.push({x:symbol.col,y:symbol.row,key:`${id}:in`,instruction:symbol.instruction.id,input:true});
   if(symbol.contact)terminals.push({x:symbol.col+symbol.span,y:symbol.row,key:`${id}:out`,instruction:symbol.instruction.id,input:false});
  }
  return {wires:grid.wires,terminals,railX:0};
 };
 const differences=compareConnectionGraphs(source.map(describe),target.map(describe));
 for(const [side,networks] of [source,target].entries())networks.forEach((network,index)=>network.connectionDifferences=differences[side][index]);
}
