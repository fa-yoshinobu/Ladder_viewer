import type {KeyenceInstruction,KeyenceProgram} from './model';
import type {KeyenceDeviceComments} from './comments';
import {decodeKeyenceText} from './encoding';
import {keyenceKvxFunction} from './kvxFunctions';
import {linkKeyenceMacros} from './macros';

// Quoted strings may contain semicolons; only an unquoted semicolon starts a comment.
function instructionParts(line:string):{tokens:string[];comment:string} {
 const tokens:string[]=[];let token='',quote='',comment='';
 for(let index=0;index<line.length;index++){
  const char=line[index];
  if(quote){
   token+=char;
   if(char===quote){
    if(line[index+1]===quote){token+=line[++index];}
    else quote='';
   }
  }else if(char==='"'||char==="'"){quote=char;token+=char;}
  else if(char===';'){comment=line.slice(index+1).trim();break;}
  else if(/\s/.test(char)){if(token){tokens.push(token);token='';}}
  else token+=char;
 }
 if(token)tokens.push(token);
 return {tokens,comment};
}

// GX CSV normalization and instruction semantics do not apply to MNM.
export function parseKeyenceMnm(bytes:ArrayBuffer,name:string,externalComments:KeyenceDeviceComments={}):KeyenceProgram {
 const text=decodeKeyenceText(bytes);
 const lines=text.split(/\r\n?|\n/);
 if(lines.at(-1)==='')lines.pop(); // A final line terminator is not an extra source row.
 const device=/^DEVICE:(.+)$/.exec(lines.find(line=>line.trim())?.trim()??'');
 if(!device)throw new Error('キーエンスMNMのDEVICEヘッダーがありません。');
 const program:KeyenceProgram={format:'keyence-mnm',name,deviceCode:device[1].trim(),moduleName:'',moduleType:'',instructions:[],text,deviceComments:{...externalComments},metadata:[],comments:[]};
 let statements:string[]=[];
 let st:KeyenceInstruction|undefined;
 let annotation:{instruction:KeyenceInstruction;lines:string[]}|undefined;
 let disabledDepth=0;
 for(const [index,raw] of lines.entries()){
  const line=raw.trim();
  // ST regions encode source lines with one leading semicolon, including blank lines.
  if(st&&(!line||line.startsWith(';'))){
   st.st!.lines.push({sourceLine:index+1,raw,text:line?raw.slice(raw.indexOf(';')+1):raw});st.sourceEndLine=index+1;continue;
  }
  st=undefined;if(!line)continue;
  const metadata=/^;?(DEVICE|MODULE|MODULE_TYPE|SCRIPT_TYPE):(.*)$/.exec(line);
  if(metadata){
   annotation=undefined;
   const [,key,value]=metadata;program.metadata.push({sourceLine:index+1,key,value});
   if(key==='MODULE')program.moduleName=value;
   if(key==='MODULE_TYPE')program.moduleType=value;
  }else if(line.startsWith(';')){
   const comment=line.slice(1).replace(/<h[1-6]\s*\/>/gi,'');
   program.comments.push({sourceLine:index+1,text:comment});
   if(annotation){annotation.lines.push(comment.trim());annotation.instruction.statement=annotation.lines.join('\n');annotation.instruction.sourceEndLine=index+1;}
   else statements.push(comment.trim());
  }else{
   const {tokens,comment}=instructionParts(line);
   const [opcode='',...operands]=tokens;
   const op=opcode.toUpperCase();
   if(op==='DISABLED_RUNG')disabledDepth++;
   const instruction:KeyenceInstruction={id:`mnm-line-${index+1}`,sourceLine:index+1,opcode,operands,raw,comment,statement:statements.join('\n')};
   if(disabledDepth>0)instruction.disabled=true;
   if(op==='END_DISABLED_RUNG')disabledDepth=Math.max(0,disabledDepth-1);
   if(op==='AREA_ST'||op==='BOX_ST'){instruction.st={lines:[]};st=instruction;}
   annotation=/^(BOOKMARK|RUNG_COMMENT)$/i.test(opcode)?{instruction,lines:statements}:undefined;
   program.instructions.push(instruction);
   statements=[];
  }
 }
 if(!program.instructions.length)throw new Error('キーエンスMNMに命令がありません。');
 for(const i of program.instructions)if(/^(FB|FUN|FUNLD|FUNAND|FBEXEC|FBEAND)$/i.test(i.opcode)){
  const hasInstance=/^(FBEXEC|FBEAND)$/i.test(i.opcode),start=hasInstance?2:1;
  i.fb={name:i.operands[0]??i.opcode,
   ...(hasInstance&&i.operands[1]!==undefined?{instance:i.operands[1],instanceOperandIndex:1}:{}),
   pins:i.operands.slice(start).map((value,index)=>({name:'引数'+(index+1),value,operandIndex:index+start}))};
  if(program.deviceCode==='60')i.fb=keyenceKvxFunction(i.opcode,i.fb);
 }
 linkKeyenceMacros([program]);
 return program;
}
