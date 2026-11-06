import type {StToken,StTokenKind} from '../stSyntax';

const keywords=new Set('IF THEN ELSE ELSEIF ELSIF END ENDIF FOR TO STEP NEXT WHILE WEND DO LOOP UNTIL EXIT BREAK CONTINUE RETURN SELECT CASE AND OR XOR NOT MOD'.split(' '));
const word=/[\p{L}_@][\p{L}\p{N}_@.]*/uy;
const number=/(?:&H[\dA-F]+|&B[01]+|\$[\dA-F]+|#?[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:E[+-]?\d+)?)/iy;

// Legacy KV scripts use apostrophe-to-end-of-line comments, unlike IEC ST strings.
function scriptTokens(text:string):StToken[]{
 const tokens:StToken[]=[];let pos=0;
 while(pos<text.length){
  const start=pos;let kind:StTokenKind='plain';
  if(text[pos]==="'"){
   kind='comment';pos=text.indexOf('\n',pos);if(pos<0)pos=text.length;
  }else if(text[pos]==='"'){
   kind='string';pos++;
   while(pos<text.length&&text[pos]!=='\n'){
    if(text[pos++]==='"'){if(text[pos]==='"'){pos++;continue;}break;}
   }
  }else{
   word.lastIndex=pos;number.lastIndex=pos;
   const identifier=word.exec(text),numeric=identifier?null:number.exec(text);
   if(identifier){pos+=identifier[0].length;kind=keywords.has(identifier[0].toUpperCase())?'keyword':/^\s*\(/.test(text.slice(pos))?'function':'plain';}
   else if(numeric){pos+=numeric[0].length;kind='number';}
   else pos++;
  }
  const previous=tokens.at(-1);
  if(previous?.kind===kind)previous.end=pos;else tokens.push({start,end:pos,kind});
 }
 return tokens;
}

export function highlightKeyenceScriptRows(rows:readonly {text:string;continuation:boolean}[]):{text:string;kind:StTokenKind}[][]{
 let source='';const offsets:number[]=[];
 for(const row of rows){if(offsets.length&&!row.continuation)source+='\n';offsets.push(source.length);source+=row.text;}
 const tokens=scriptTokens(source);let tokenIndex=0;
 return rows.map((row,index)=>{
  const start=offsets[index],end=start+row.text.length,parts:{text:string;kind:StTokenKind}[]=[];
  if(start===end)return parts;
  while(tokenIndex<tokens.length&&tokens[tokenIndex].end<=start)tokenIndex++;
  for(let n=tokenIndex;n<tokens.length&&tokens[n].start<end;n++){
   const token=tokens[n];parts.push({text:source.slice(Math.max(start,token.start),Math.min(end,token.end)),kind:token.kind});
  }
  return parts;
 });
}
