"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { createAnchorOpener } = require("../lib/anchor-opener.js");
const { sourceHunks } = require("../lib/source-diff.js");
const { createDecorationRegistry } = require("../lib/decoration-registry.js");
function fixture(t) {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "relay-opener-")));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  fs.writeFileSync(path.join(workspace, "a.js"), "head\n");
  const uri = (scheme, value, query = "") => ({ scheme, path: value, fsPath: value, query, toString() { return `${scheme}:${value}?${query}`; } });
  const groups = [{ viewColumn: 1, tabs: [], activeTab: null }], textDocuments = [], closed = [], handlers = [];
  const event = fn => { handlers.push(fn); return { dispose() {} }; };
  const emit = () => handlers.forEach(f => f());
  const vscode = { Uri: { file: p => uri("file", p), from: o => uri(o.scheme, o.path, o.query) }, ViewColumn: { Beside: -2 },
    workspace: { textDocuments, registerTextDocumentContentProvider: () => ({ dispose() {} }), openTextDocument: async uri => ({ uri }) },
    window: { tabGroups: { all: groups, onDidChangeTabs: event, onDidChangeTabGroups: event, close: async tab => { closed.push(tab); for (const g of groups) g.tabs = g.tabs.filter(t => t !== tab); emit(); } }, showTextDocument: async (doc, options) => show({uri:doc.uri}, options) },
    commands: { executeCommand: async (_, original, modified, label, options) => show({original,modified},options) },
  };
  function show(input, options) {
    let g = groups.find(g => g.viewColumn === options.viewColumn);
    if (!g) { g = {viewColumn:groups.length+1,tabs:[],activeTab:null}; groups.push(g); }
    let tab = g.tabs.find(t => (t.input.uri || t.input.modified).toString() === (input.uri || input.modified).toString());
    if (!tab) { const old=g.tabs.find(t=>t.isPreview); if(old) g.tabs=g.tabs.filter(t=>t!==old); tab={input,isPreview:true,isPinned:false,isDirty:false}; g.tabs.push(tab); }
    g.activeTab=tab; emit(); return {viewColumn:g.viewColumn};
  }
  const opener=createAnchorOpener(vscode); t.after(()=>opener.dispose());
  const anchor={n:1,path:'a.js',view:'head',rev:{base:'a'.repeat(40),head:'b'.repeat(40)}};
  const state={workspace,identity:'snapshot',texts:new Map([['a.js',{base:'base\n',head:'head\n'}]])};
  return {workspace,vscode,groups,textDocuments,opener,anchor,state,closed,emit,show};
}
test('real head files require matching disk and open buffer; symlinks and drift stay immutable', t => {
  const f=fixture(t); let r=f.opener.describe(f.state,f.anchor); assert.equal(r.head.scheme,'file');
  f.textDocuments.push({uri:r.head,getText:()=> 'unsaved\n'}); assert.equal(f.opener.describe(f.state,f.anchor).head.scheme,'relay-rev');
  f.textDocuments.length=0; fs.writeFileSync(path.join(f.workspace,'a.js'),'changed\n'); assert.equal(f.opener.describe(f.state,f.anchor).head.scheme,'relay-rev');
  fs.renameSync(path.join(f.workspace,'a.js'),path.join(f.workspace,'target')); fs.symlinkSync('target',path.join(f.workspace,'a.js')); assert.equal(f.opener.describe(f.state,f.anchor).head.scheme,'relay-rev');
});
test('existing reviewer tabs are reused in their group and never adopted or closed', async t => {
  const f=fixture(t), r=f.opener.describe(f.state,f.anchor);
  f.show({uri:r.head},{viewColumn:1}); const user=f.groups[0].activeTab;
  const first=await f.opener.open(r,new Set(),{focus:true}); const second=await f.opener.open(r,new Set());
  assert.equal(first.tab,user); assert.equal(second.tab,user); assert.equal(f.groups.length,1);
  assert.equal(f.opener.disposable(user),false); await f.opener.closeExcept(()=>false); assert.equal(f.closed.length,0);
});
test('cleanup closes only untouched owned previews; adoption is permanent', async t => {
  const f=fixture(t), r=f.opener.describe(f.state,f.anchor);
  let entry=await f.opener.open(r,new Set()); await f.opener.closeExcept(()=>false); assert.deepEqual(f.closed,[entry.tab]);
  for (const kind of ['pin','dirty','move']) {
    entry=await f.opener.open(r,new Set()); const tab=entry.tab;
    if(kind==='pin') tab.isPreview=false;
    if(kind==='dirty') tab.isDirty=true;
    if(kind==='move') f.groups[0].viewColumn=9;
    f.emit(); tab.isPreview=true; tab.isDirty=false; f.groups[0].viewColumn=1;
    await f.opener.closeExcept(()=>false); assert.ok(!f.closed.includes(tab));
    f.groups[0].tabs=[]; f.groups[0].activeTab=null; f.emit();
  }
});
test('opener protects reviewer previews and refuses a fourth occupied group', async t => {
  const f=fixture(t); f.show({uri:f.vscode.Uri.file(path.join(f.workspace,'reviewer.js'))},{viewColumn:1});
  const user=f.groups[0].activeTab, r=f.opener.describe(f.state,f.anchor);
  assert.equal((await f.opener.open(r,new Set())).column,2); assert.ok(f.groups[0].tabs.includes(user));
  const next={...r,target:f.vscode.Uri.file(path.join(f.workspace,'other.js')),head:f.vscode.Uri.file(path.join(f.workspace,'other.js'))};
  assert.equal(await f.opener.open(next,new Set([1,2,3])),null); assert.equal(f.groups.length,2);
});
test('captured-text hunks place removed-code seams independent of repository changes', () => {
  assert.deepEqual(sourceHunks({base:'one\nremoved\nthree\n',head:'one\nthree\n'}),[{baseStart:2,baseLen:1,headStart:1,headLen:0}]);
});
test('the registry reuses six palette sets, keeps distinct colors, and disposes them', () => {
  const created=[];
  const vscode={ThemeColor:class{constructor(id){this.id=id;}},OverviewRulerLane:{Left:1},window:{createTextEditorDecorationType(options){const t={options,dispose(){this.disposed=true;}};created.push(t);return t;}}};
  const registry=createDecorationRegistry(vscode), first=registry.forAnchor(1);
  assert.equal(registry.forAnchor(7),first); assert.equal(first.types.rail.options.borderColor.id,'relay.anchor1');
  assert.equal(registry.forAnchor(2).types.boxOne.options.borderColor.id,'relay.anchor2');
  for(let n=1;n<=99;n++) registry.forAnchor(n);
  assert.equal(created.length,Object.keys(first.types).length*6);
  registry.dispose(); assert.ok(created.every(t=>t.disposed));
});
test('a removed-code companion uses a new third column, never the occupied adjacent one', async t => {
  const f=fixture(t), r=f.opener.describe(f.state,f.anchor), used=new Set();
  await f.opener.open(r,used);
  const otherUri=f.vscode.Uri.file(path.join(f.workspace,'other.js'));
  await f.opener.open({...r,target:otherUri,head:otherUri},used);
  const result=await f.opener.open(r,used,{companion:true});
  assert.equal(result.column,3); assert.equal(f.groups.length,3);
  assert.ok(f.groups[1].tabs.some(t=>t.input.uri.toString()===otherUri.toString()));
});
