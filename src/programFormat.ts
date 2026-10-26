export function programFormat(name:string):'mitsubishi'|'keyence'|undefined {
 if(/\.mnm$/i.test(name))return 'keyence';
 if(/\.csv$/i.test(name))return 'mitsubishi';
 return undefined;
}
