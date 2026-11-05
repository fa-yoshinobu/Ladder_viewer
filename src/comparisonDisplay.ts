import type { Program } from './model';

export type ComparisonDisplay = 'both' | 'source' | 'target';

export function comparisonDisplayProgram(program:Program,display:ComparisonDisplay):Program {
 if(display==='both'||!program.comparison)return program;
 const side=display==='target'?program.comparison.target:program;
 return {...side,networks:side.networks.map(({rowAlignment,branchRowAlignment,outputRowAlignment,comparisonPageRows,comparisonNotePadding,...network})=>network)};
}
