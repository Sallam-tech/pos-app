import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {TestCashClosing} from "@/components/admin/test-cash-closing";
const state=vi.hoisted(()=>({marker:null as unknown,calls:[] as {url:string;body?:Record<string,unknown>}[]}));
vi.mock("@/lib/cash/client",()=>({cashToday:()=>"2026-11-23",cashFetch:async(url:string,body?:Record<string,unknown>)=>{state.calls.push({url,body});if(url.includes("overview"))return {context:"a".repeat(64),summary:{businessDate:"2026-11-23",sourceDigest:"b".repeat(64),currentGaps:[],financial:{},recordedSignedFlows:[],count:null},history:{items:[],pending:[],counts:[]},closings:{items:[],nextCursor:null}};if(url.endsWith("/execute"))return {state:"COMMITTED",key:(state.marker as {key:string}).key,context:"a".repeat(64),action:"START_COUNT",result:{}};throw Error("Unexpected request "+url);}}));
vi.mock("@/lib/cash/recovery-store",()=>({readMarker:async()=>state.marker,claimMarker:async(m:unknown)=>{state.marker=m;},armMarker:async(m:Record<string,unknown>)=>{state.marker={...m,state:"ATTEMPTED"};return state.marker;},confirmMarker:async(m:Record<string,unknown>)=>({...m,state:"CONFIRMED"}),acknowledgeMarker:async()=>{state.marker=null;},sameMarker:(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)}));
beforeEach(()=>{state.marker=null;state.calls=[];});
it("reviews a count without collecting an unused password, then sends it once to server authorization",async()=>{
 render(<TestCashClosing/>);
 const review=await screen.findByRole("button",{name:"Review Start Physical Count"});await waitFor(()=>expect(review).toBeEnabled());
 expect(screen.queryByLabelText("Admin Password",{exact:true})).not.toBeInTheDocument();
 fireEvent.click(review);
 const password=await screen.findByLabelText("Admin password - authorize this count once");
 const confirm=screen.getByRole("button",{name:"Confirm Exact Cash Action"});
 fireEvent.click(screen.getByLabelText("I verified these exact cash facts and approve this action once."));expect(confirm).toBeDisabled();
 fireEvent.change(password,{target:{value:"TEST password input only"}});fireEvent.click(confirm);
 await waitFor(()=>expect(state.calls.filter(x=>x.body?.password)).toHaveLength(1));
 expect(state.calls.find(x=>x.body?.password)?.url).toMatch(/execute$/);expect(state.calls.find(x=>x.body?.password)?.body?.input).toEqual({businessDate:"2026-11-23",evidence:"Admin requested a physical cash count."});
});
