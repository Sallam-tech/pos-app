import "server-only";
import type {IncomingMessage,ServerResponse} from "node:http";
// Only an already allowlisted, read-only framework render may detach after its
// transport closes. Business/auth handlers and their transactions still drain.
export async function renderReadOnlyResponse(request:IncomingMessage,response:ServerResponse,render:()=>unknown){
 if(request.method!=="GET"&&request.method!=="HEAD")throw Error("Read-only render required.");
 let done!:()=>void;
 const closed=new Promise<void>(resolve=>{done=resolve;});response.once("close",done);
 try{
  if(request.aborted||response.destroyed)return;
  // Observe late framework rejection without retaining a dead health response.
  await Promise.race([Promise.resolve().then(render),closed]);
 }finally{response.removeListener("close",done);}
}