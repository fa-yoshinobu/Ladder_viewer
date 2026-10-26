export function formatInstructionCopy(command:string,comments:readonly {address:string;comment:string}[],extras:readonly string[]=[]):string {
 return [command,...comments.filter(item=>item.comment).map(item=>`${item.address}: ${item.comment}`),...extras.filter(Boolean)]
  .join('\n').replace(/\r\n?|\n/g,'\r\n');
}
