export type SearchTextMode='partial'|'exact';
export const normalizeSearchText=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
export function searchTextMatches(fields:readonly string[],normalizedQuery:string,mode:SearchTextMode):boolean {
 const needle=normalizedQuery;
 if(!needle)return false;
 return mode==='exact'?fields.includes(needle):needle.split(' ').every(term=>fields.some(field=>field.includes(term)));
}
