import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import vm from "node:vm";

// The "Opening Shop POS" window shows which startup step is running, using only fixed wording.
function fixture(){
 const source=readFileSync(path.resolve("desktop/main.cjs"),"utf8"),start=source.indexOf("const startupSteps="),end=source.indexOf("function showStartupWindow(",start);
 assert.ok(start>=0&&end>start,"startup progress helpers not found in main.cjs");
 const loads=[],window={isDestroyed:()=>false,loadURL:url=>{loads.push(url);return Promise.resolve();}};
 const context={startupWindow:window,encodeURIComponent};vm.createContext(context);
 vm.runInContext(source.slice(start,end)+";this.read=()=>({step:startupStep,target:startupTarget});",context);
 const page=()=>decodeURIComponent(loads.at(-1).slice("data:text/html;charset=utf-8,".length));
 return {context,loads,page};
}

test("each known startup stage shows its plain-language step and redraws the window once",()=>{
 const {context,loads,page}=fixture();
 context.setStartupStep("CHECKING_FILES");assert.match(page(),/Checking the app files\.\.\./);
 context.setStartupStep("PROTECTED_KEYS");assert.match(page(),/Unlocking your protected data\.\.\./);
 context.setStartupStep("CURRENT_ROOT_AUTHORITY");context.setStartupStep("CURRENT_ROUTING_CHECK");
 assert.equal(loads.length,3,"sub-stages with the same wording do not redraw again");
 assert.equal(context.read().target,loads.at(-1),"navigation guard follows the current page");
});

test("unknown or untrusted stage names never change the window",()=>{
 const {context,loads}=fixture();
 for(const value of ["NOT_A_STAGE","<script>alert(1)</script>","__proto__","constructor",""])context.setStartupStep(value);
 assert.equal(loads.length,0);assert.equal(context.read().step,"Getting ready");
});

test("the progress page keeps a no-script policy and respects reduced motion",()=>{
 const {context,page}=fixture();context.setStartupStep("HTTPS_RUNTIME");const html=page();
 assert.match(html,/content="default-src 'none'; style-src 'unsafe-inline'"/);
 assert.doesNotMatch(html,/<script/i);
 assert.match(html,/prefers-reduced-motion:reduce/);
 assert.match(html,/role="status"/);
});

test("a destroyed or missing window is never touched",()=>{
 const {context,loads}=fixture();context.startupWindow={isDestroyed:()=>true,loadURL:()=>{throw Error("touched");}};
 context.setStartupStep("READY");context.startupWindow=undefined;context.setStartupStep("STARTING");
 assert.equal(loads.length,0);assert.equal(context.read().step,"Starting the shop service");
});
