const comparison = /^(LD|AND|OR)(?:ED|DT|TM|D|E|\$)?(?:<>|<=|>=|=|<|>)(?:_U)?$/;
const basic = /^(?:LD(?:PI|FI|I|P|F)?|AND(?:PI|FI|P|F)?|ANI|OR(?:PI|FI|I|P|F)?)$/;

export const isComparisonCondition = (op:string):boolean => comparison.test(op);
export function contactKey(op:string,operands:string[]):string|undefined {
 const type=/^(?:LD|AND|OR)((?:PI|FI|I|P|F)?)$/.exec(op==='ANI'?'ANDI':op)?.[1];
 return type===undefined?undefined:JSON.stringify(['contact',type,operands]);
}
export function logicOperation(op:string):'load'|'and'|'or'|undefined {
 if(!basic.test(op)&&!isComparisonCondition(op))return undefined;
 return op.startsWith('LD')?'load':op.startsWith('OR')?'or':'and';
}
export const isInlineLogic = (op:string):boolean => /^(?:INV|MEP|MEF|EGP|EGF)$/.test(op);
export const isPointerDefinition = (op:string):boolean => /^(?:#?P\d+|I\d+|GLP\d+)$/.test(op);
