import type {KeyenceInstruction} from './model';
import {CELL} from '../ladderMetrics';

export interface KeyenceOutputStyle {
 kind:'coil'|'command'|'keep'|'timer'|'counter'|'labeled-coil'|'calculation'|'application'|'fb'|'bit-coil'|'jump'|'stage'|'wait'|'multi-input'|'st-box';
 body:string;above:string;below?:string;bodyOperand?:number;aboveOperand?:number;belowOperand?:number;
 columns?:number;operands?:string[];operatorColumn?:boolean;pulse?:boolean;negated?:boolean;macroParameters?:{name:string;comment:string}[];
}
// The native labels use 10.5px Consolas; allow 6px per half-width character.
const nativeTextWidth=(text:string)=>Array.from(text).reduce((width,c)=>width+(/[^\x00-\xff\uFF61-\uFF9F]/.test(c)?12:6),0);
export const keyenceTextColumns=(body:string,...fields:string[])=>Math.max(1,Math.ceil(Math.max(nativeTextWidth(body)+24,...fields.map(text=>nativeTextWidth(text)+8))/CELL));
export function keyenceBoxColumnSpans(style:KeyenceOutputStyle):number[] {
 const fit=(text:string)=>Math.max(1,Math.ceil((nativeTextWidth(text)+12)/CELL));
 if(style.body==='MCALL'){
  if((style.operands?.length??0)<=1)return [fit(style.body),Math.max(2,fit(style.operands?.[0]??''))];
  const spans=style.operands!.slice(1).map((operand,index)=>Math.max(fit(operand),fit(style.macroParameters?.[index]?.name||'P'+index)));
  const header=Math.max(3,Math.ceil((nativeTextWidth('MCALL '+style.operands![0])+24)/CELL));
  spans[spans.length-1]+=Math.max(0,header-spans.reduce((a,b)=>a+b,0));
  return spans;
 }
 const spans=Array<number>(style.columns??1).fill(1),offset=style.operatorColumn?1:0;
 spans[0]=fit(style.body);
 for(const [index,operand] of (style.operands??[]).entries()){
  const column=offset+index%(spans.length-offset);
  spans[column]=Math.max(spans[column],fit(operand));
 }
 return spans;
}
type NativeKind='calculation'|'application'|'command';
// Only instruction names and native symbol families are catalogued; program data stays in the input file.
const nativeGroups:[NativeKind,number,number,string][]=[
 ['application',0,1,'AJST ARES BCNT BCNT.D EXT EXT.D EXT.L EXT.S'],
 ['application',1,1,'ALT LOGD LOGE WTIME'],
 ['application',2,1,'AVG AVG.D AVG.DF AVG.F AVG.L AVG.S BSUM DCNT DCNT.D MAX MAX.D MAX.DF MAX.F MAX.L MAX.S MIN MIN.D MIN.DF MIN.F MIN.L MIN.S SEG SEG.D SER SER.D WSUM WSUM.D WSUM.DF WSUM.F WSUM.L WSUM.S ZRES'],
 ['command',0,1,'BREAK END ENDH MC MCR NEXT RET RETI RETURN RFSFRC STE'],
 ['command',1,1,'ADRDEC ADRINC AWHIDE AWSHOW CJ FOR FOR.D FRSET GOTO LABEL NCJ RND SBN SCJ STP ZPOP.L ZPOP.S ZPUSH.L ZPUSH.S'],
 ['command',2,1,'HKEY'],
 ['command',2,2,'ADRADD.L ADRADD.S ADRSET ADRSUB.L ADRSUB.S BSIZE BSWAP CPSASC DASC DASC.D DASC.L DASC.S DISS FDEL FDEL.D FIFOR FIFOR.D FIFOW FIFOW.D LEN LIFOR LIFOR.D LIFOW LIFOW.D MDEL MMKDIR MOV MOV.A MOV.D MOV.DF MOV.F MOV.L MOV.S MRMDIR RDASC RDASC.D RDASC.L RDASC.S RFASC RFSCI RFSCI.D RFSCI.F RFSCI.L RFSCI.S RFSCO RFSCO.D RFSCO.F RFSCO.L RFSCO.S RFSX RFSY RHASC RHASC.D RSEC SEC SMOV WSIZE XCH XCH.D INT'],
 ['command',2,3,'CAL<< CAL<<.D CAL<<.L CAL<<.S CAL>> CAL>>.D CAL>>.L CAL>>.S CAL~ CAL~.D'],
 ['command',3,3,'BBMOV BMOV BMOV.D BSL BSL.D BSR BSR.D CPMSET CRC DISB DISB.D DISF DISN DISN.D FASC FINS FINS.D FLIK FMOV FMOV.D FMOV.DF FMOV.F FMOV.L FMOV.S FWRIT FWRIT.D HASC HASC.D LLFLT MFREE MFREEK MPRINT MREN MSTAT PIDAT RCOM RCPSASC SADD SLEFT SORT SORT.D SORT.L SORT.S SRGHT STRIM TPOUT UNIB UNIB.D UNIF UNIN UNIN.D UNIS WSL WSL.D WSR WSR.D'],
 ['command',4,3,'BCMP BCMP.D BCMP.L BCMP.S BCMPI BCMPI.D BCMPI.L BCMPI.S SDEL SFIND SINS SMID'],
 ['command',5,3,'BYBMOV BYLMOV MREAD MWRIT PMOV PMOV.D SRPLC'],
 ['command',3,4,'CAL& CAL&.D CAL* CAL+ CAL+.D CAL+.DF CAL+.F CAL+.L CAL+.S CAL- CAL-.D CAL-.DF CAL-.F CAL-.L CAL-.S CAL/ CAL/.D CAL/.DF CAL/.F CAL/.L CAL/.S CAL^ CAL^.D CAL| CAL|.D'],
 ['command',4,4,'APR APR.D APR.DF APR.F APR.L APR.S BANDC.L BANDC.S BBCMP CPMGET DSER DSER.D FRLDM FRSTM LIMIT LIMIT.D LIMIT.L LIMIT.S MCOPY MMOV MREADL RAMP SFINDN SORTN SORTN.D SORTN.L SORTN.S UFILL UFILL.D UFILL.F UFILL.L UFILL.S UREAD UREAD.D UREAD.F UREAD.L UREAD.S UWRIT UWRIT.D UWRIT.F UWRIT.L UWRIT.S ZONE.L ZONE.S'],
 ['command',1,3,'MCALL'],
 ['calculation',0,1,'ABS.DF ABS.F ABS.L ABS.S ACOS ACOS.DF ASC ASIN ASIN.DF ATAN ATAN.DF COM COM.D COS COS.DF DEG DEG.DF DFLOAT DFLOAT.D DFLOAT.L DFLOAT.S DFTOF DI DINTG DINTG.D DINTG.L DINTG.S DMX DROUND DROUND.D DROUND.L DROUND.S EI EXP EXP.DF FLOAT FLOAT.D FLOAT.L FLOAT.S FTODF GRY GRY.D INTG INTG.D INTG.L INTG.S LOG LOG.DF LOG10 LOG10.DF NEG NEG.D NEG.DF NEG.F NEG.L NEG.S RAD RAD.DF RASC RGRY RGRY.D ROOT ROOT.D ROOT.DF ROOT.F ROOT.L ROOT.S ROUND ROUND.D ROUND.L ROUND.S SIN SIN.DF SWAP SWAP.D TAN TAN.DF TBCD TBCD.D TBIN TBIN.D'],
 ['calculation',1,1,'ADD ADD.D ADD.DF ADD.F ADD.L ADD.S ANDA ANDA.D ASLA ASLA.D ASLA.L ASLA.S ASRA ASRA.D ASRA.L ASRA.S CMP CMP.D CMP.DF CMP.F CMP.L CMP.S DEC DEC.D DEC.L DEC.S DIC DIV DIV.D DIV.DF DIV.F DIV.L DIV.S ENRA ENRA.D EORA EORA.D INC INC.D INC.L INC.S LDA LDA.D LDA.DF LDA.F LDA.L LDA.S MPX MUL MUL.D MUL.DF MUL.F MUL.L MUL.S ORA ORA.D POW POW.D POW.DF POW.F POW.L POW.S RLA RLA.D RLNCA RLNCA.D RRA RRA.D RRNCA RRNCA.D SLA SLA.D SRA SRA.D STA STA.D STA.DF STA.F STA.L STA.S SUB SUB.D SUB.DF SUB.F SUB.L SUB.S TMIN'],
 ['calculation',2,1,'ATAN2 ATAN2.DF DECO DW DW.D DW.DF DW.F DW.L DW.S ENCO PLDA PLDA.D PSTA PSTA.D SCMP ZCMP ZCMP.D ZCMP.DF ZCMP.F ZCMP.L ZCMP.S'],
];
const nativeStyles=new Map(nativeGroups.flatMap(([kind,arity,columns,names])=>names.split(' ').map(name=>[name,{kind,arity,columns}] as const)));

export function keyenceNumberedDevice(instruction:KeyenceInstruction):string {
 const opcode=instruction.opcode.toUpperCase().replace(/^@/,''),prefix=/^(?:TMR|TMS|TMH|TMU)$/.test(opcode)?'T':opcode==='OUTC'||opcode==='C'?'C':'';
 if(!prefix)return '';
 const match=new RegExp('^(?:#|'+prefix+')(\\d+)$','i').exec(instruction.operands[0]??'');
 return match?prefix+match[1]:'';
}
// Unrecognized spellings and operand counts retain their complete command text.
export function keyenceOutputStyle(instruction:KeyenceInstruction):KeyenceOutputStyle {
 const opcode=instruction.opcode.toUpperCase().replace(/^@/,''),operands=instruction.operands;
 const style:KeyenceOutputStyle={kind:'command',body:[instruction.opcode,...operands].join(' '),above:''};
 const native={...style,body:opcode,pulse:instruction.opcode.startsWith('@')};
 const fields={above:operands[0]??'',aboveOperand:0,below:operands[1]??'',belowOperand:1};
 if(instruction.fb)return {...style,kind:'fb'};
 if(instruction.st&&opcode==='BOX_ST')return {...style,kind:'st-box'};
 if(opcode==='MCALL'&&operands.length>1)return {...native,kind:'command',columns:operands.length-1,operands,macroParameters:instruction.macro?.parameters};
 if((opcode==='OUT'||opcode==='OUB')&&operands.length===1)return {...native,kind:'coil',body:operands[0],bodyOperand:0,negated:opcode==='OUB'};
 if(opcode==='KEEP'&&operands.length===1)return {...native,kind:'keep',above:operands[0],aboveOperand:0};
 if((opcode==='UDT'||opcode==='UDC')&&operands.length===2)return {...native,kind:'multi-input',body:opcode+' '+operands[0],bodyOperand:0,above:operands[1],aboveOperand:1};
 if(/^(?:SFT|ITVL(?:\.S)?|PID)$/.test(opcode)&&operands.length===2)return {...native,...fields,kind:'multi-input'};
 if((opcode==='SET'||opcode==='RES')&&operands.length===1)return {...native,kind:'labeled-coil',above:operands[0],aboveOperand:0};
 if(/^(?:ONDL|OFDL|SHOT|BSET(?:\.D)?|BRES(?:\.D)?)$/.test(opcode)&&operands.length===2)return {...native,...fields,kind:'labeled-coil'};
 if(/^(?:BOUT|BOUB)(?:\.D)?$/.test(opcode)&&operands.length===2)return {...native,...fields,kind:'bit-coil',body:opcode.endsWith('.D')?'B.D':'B',negated:opcode.startsWith('BOUB')};
 const device=keyenceNumberedDevice(instruction);
 if((/^(?:TMR|TMH|TMS|TMU|OUTC)$/.test(opcode)&&operands.length===2)||(opcode==='C'&&operands.length===3)){
  const prefix=opcode==='OUTC'||opcode==='C'?'C':opcode==='TMR'?'T':'T'+opcode.slice(-1);
  return {...native,kind:opcode==='OUTC'?'counter':'timer',body:device?prefix+device.slice(1):prefix+' '+operands[0],above:operands[1],below:operands[2]??'',bodyOperand:0,aboveOperand:1,belowOperand:2};
 }
 if((opcode==='CALL'||opcode==='DIFU'||opcode==='DIFD')&&operands.length===1)return {...native,kind:'application',above:operands[0],aboveOperand:0};
 if((opcode==='JMP'&&operands.length===1)||(opcode==='ENDS'&&operands.length===0))return {...native,kind:'jump',above:operands[0]??'',aboveOperand:0};
 if(opcode==='STG'&&operands.length===1)return {...native,kind:'stage',above:operands[0],aboveOperand:0};
 if(/^W-(?:ON|OFF|UE|DE)$/.test(opcode)&&operands.length===2)return {...native,...fields,kind:'wait',body:opcode.slice(2)};
 const known=nativeStyles.get(opcode);
 if(!known||known.arity!==operands.length)return style;
 if(known.kind==='command')return {...native,kind:'command',body:opcode.startsWith('CAL')?opcode.slice(3):opcode,columns:known.columns,operands,operatorColumn:opcode.startsWith('CAL')};
 return {...native,...fields,kind:known.kind};
}
