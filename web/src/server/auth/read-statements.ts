import "server-only";
// Compiled read programs only. No bindings, rows, authority or verdicts stored.
// Owner discards programs at every write/control/boundary and on any error.
export function createReadStatements<S>(compile:(sql:string)=>S,canReuse:()=>boolean){
 const entries=new Map<string,S>();let bytes=0;
 const clear=()=>{entries.clear();bytes=0;};
 return {clear,read(sql:string):S{
  try{
   if(!canReuse()){clear();return compile(sql);}
   const old=entries.get(sql);if(old!==undefined)return old;
   const statement=compile(sql),size=Buffer.byteLength(sql);
   if(size>524288)return statement;
   if(entries.size>=128||bytes+size>524288)clear();
   entries.set(sql,statement);bytes+=size;return statement;
  }catch(error){clear();throw error;}
 }};
}
