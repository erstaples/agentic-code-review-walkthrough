"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const {createTourView}=require("./compiled.js")("src/host/tour-view.js");
function fixture() {
  let receive;const messages=[],calls=[];
  const webview={asWebviewUri:u=>u,cspSource:'vscode-resource:',postMessage:async m=>messages.push(m),onDidReceiveMessage:fn=>{receive=fn;return{dispose(){}}}};
  const vscode={Uri:{joinPath:(...p)=>p.join('/')},commands:{executeCommand:async()=>{}}};
  const controller={layout:async b=>calls.push(b),navigate:async b=>calls.push(b)};
  const view=createTourView(vscode,'extension',()=>controller);
  view.resolveWebviewView({webview,show(){},onDidDispose(){}});
  return {view,webview,messages,calls,receive:m=>receive(m)};
}
test('view requires a revision for editor mutations and forwards only known layout fields',async()=>{
  const f=fixture();await f.receive({type:'layout',action:'reset'});assert.equal(f.calls.length,0);assert.equal(f.messages.at(-1).type,'error');
  await f.receive({type:'layout',action:'place',anchor:3,placement:{kind:'replace',of:2},revision:7,command:'malicious',path:'/outside'});
  assert.deepEqual(f.calls,[{action:'place',anchor:3,placement:{kind:'replace',of:2},pinned:undefined,remember:undefined,expectedRevision:7}]);
});
test('number shortcuts wait for the webview ready handshake before opening an anchor picker',async()=>{
  const f=fixture();f.messages.length=0;await f.view.showAnchor(12);assert.equal(f.messages.length,0);
  await f.receive({type:'ready'});assert.equal(f.messages.at(-1).type,'selectAnchor');assert.equal(f.messages.at(-1).anchor,12);
  assert.ok(f.webview.html.indexOf('id="inventory"')<f.webview.html.indexOf('id="narration"'));
});
