import type {KeyenceProgram} from './model';
import type {KeyenceDeviceComments} from './comments';
import {decodeKeyenceText} from './encoding';
import {applyKeyenceReference} from './reference';

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
export function parseKeyenceMnm(bytes:ArrayBuffer,name:string,externalComments:KeyenceDeviceComments={},referenceHtml?:string):KeyenceProgram {
 const text=decodeKeyenceText(bytes);
 const lines=text.split(/\r\n?|\n/),device=/^DEVICE:(.+)$/.exec(lines.find(line=>line.trim())?.trim()??'');
 if(!device)throw new Error('キーエンスMNMのDEVICEヘッダーがありません。');
 const program:KeyenceProgram={format:'keyence-mnm',name,deviceCode:device[1].trim(),moduleName:'',moduleType:'',instructions:[],text,deviceComments:{...externalComments},metadata:[],comments:[]};
 let statements:string[]=[];
 for(const [index,raw] of lines.entries()){
  const line=raw.trim();if(!line)continue;
  const metadata=/^;?(DEVICE|MODULE|MODULE_TYPE|SCRIPT_TYPE):(.*)$/.exec(line);
  if(metadata){
   const [,key,value]=metadata;program.metadata.push({sourceLine:index+1,key,value});
   if(key==='MODULE')program.moduleName=value;
   if(key==='MODULE_TYPE')program.moduleType=value;
  }else if(line.startsWith(';')){
   const comment=line.slice(1).replace(/<h[1-6]\s*\/>/gi,'');
   program.comments.push({sourceLine:index+1,text:comment});
   statements.push(comment.trim());
  }else{
   const {tokens,comment}=instructionParts(line);
   const [opcode='',...operands]=tokens;
   program.instructions.push({id:`mnm-line-${index+1}`,sourceLine:index+1,opcode,operands,raw,comment,statement:statements.join('\n')});
   statements=[];
  }
 }
 if(!program.instructions.length)throw new Error('キーエンスMNMに命令がありません。');
 applyKeyenceReference(program,referenceHtml);
 return program;
}
