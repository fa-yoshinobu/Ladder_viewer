export function decodeKeyenceText(bytes:ArrayBuffer):string {
 const data=new Uint8Array(bytes);
 const encoding=data[0]===0xff&&data[1]===0xfe?'utf-16le':data[0]===0xfe&&data[1]===0xff?'utf-16be':'utf-8';
 try{return new TextDecoder(encoding,{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');}
 catch{return new TextDecoder('shift_jis',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');}
}
