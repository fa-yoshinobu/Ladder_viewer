import type {CsvInput} from './batch';
import {programFormat} from './programFormat';
export async function droppedInputs(transfer:DataTransfer):Promise<CsvInput[]>{
 const entries=Array.from(transfer.items).map(item=>item.webkitGetAsEntry?.()).filter((entry):entry is FileSystemEntry=>!!entry),files=Array.from(transfer.files),inputs:CsvInput[]=[];
 const root=entries.length===1&&entries[0].isDirectory?entries[0].fullPath.replace(/^\//,'')+'/':'';
 const visit=async(entry:FileSystemEntry)=>{
  if(entry.isDirectory){const reader=(entry as FileSystemDirectoryEntry).createReader();for(;;){const children=await new Promise<FileSystemEntry[]>((resolve,reject)=>reader.readEntries(resolve,reject));if(!children.length)break;for(const child of children)await visit(child);}}
  else if(entry.isFile&&programFormat(entry.name)){const file=await new Promise<File>((resolve,reject)=>(entry as FileSystemFileEntry).file(resolve,reject));const name=entry.fullPath.replace(/^\//,'');inputs.push({name,relativePath:root&&name.startsWith(root)?name.slice(root.length):undefined,folder:name.split('/').slice(0,-1).join('/').toLowerCase(),bytes:await file.arrayBuffer()});}
 };
 if(entries.length)for(const entry of entries)await visit(entry);
 else for(const file of files)if(programFormat(file.name))inputs.push({name:file.webkitRelativePath||file.name,bytes:await file.arrayBuffer()});
 return inputs;
}
