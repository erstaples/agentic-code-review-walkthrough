"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vscode = require('vscode');
const { ReviewMapService } = require('../../../mcp/lib/review-map/service.js');
const { createCallTool } = require('../../../mcp/lib/tools.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
module.exports = function register({ test, before }) {
  const fixture = JSON.parse(fs.readFileSync(process.env.KANKO_TOUR_FIXTURE));
  const output = process.env.KANKO_TOUR_OUTPUT;
  const service = new ReviewMapService({ root: fixture.stateRoot });
  let lock, call;
  const results = [];
  const record = (name, value) => { results.push({ name, value }); fs.writeFileSync(path.join(output, 'automated.json'), JSON.stringify({ vscode: vscode.version, results }, null, 2)); };
  const api = (name, args = {}) => call(name, { workspace: fixture.workspace, ...args });
  const load = async () => {
    let result = await api('kanko_tour_load', { mapId: fixture.mapId });
    // These phase 3/4 scenarios exercise simultaneous editors. Sequence itself
    // has separate native coverage below, independent of the window size.
    if (result.snapshot.presentation.layout.sequence) {
      await vscode.commands.executeCommand('kanko.tour.overrideSequence');
      result = await api('kanko_tour_status');
    }
    return result;
  };
  const http = async (route, body) => (await fetch(`http://127.0.0.1:${lock.port}${route}`, { method: 'POST', headers: { authorization: `Bearer ${lock.authToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...body, protocolVersion: 3 }) })).json();
  const tabs = () => vscode.window.tabGroups.all.flatMap(g => g.tabs.map(t => ({ label: t.label, uri: (t.input?.uri || t.input?.modified)?.toString() })));
  before(async () => {
    await vscode.extensions.getExtension('getkankodev.kanko').activate();
    const dir = path.join(os.homedir(), '.kanko/tour');
    lock = fs.readdirSync(dir).filter(n => n.endsWith('.lock')).map(n => JSON.parse(fs.readFileSync(path.join(dir, n)))).find(l => l.pid === process.pid);
    assert.ok(lock); call = createCallTool({ mapService: service, resolveLock: () => lock });
  });
  test('public MCP loads the authored tour and renders a source-backed first beat', async () => {
    const result = await load();
    assert.equal(result.ok, true); assert.equal(result.snapshot.stop.id, 'validation'); assert.equal(result.snapshot.beat.id, 'guard');
    assert.match(result.snapshot.narrationHtml, /data-anchor="2"/); assert.match(result.snapshot.narration, /② service.test.js:3/);
    assert.match(result.snapshot.receiptNarration, /@\w{7}/);
    assert.ok(tabs().some(t => t.label.includes('service.js')));
    assert.equal(result.snapshot.presentation.anchors.filter(a => a.status === 'visible').length, 2);
    assert.equal(result.snapshot.presentation.anchors[0].removedCode, 'companion');
    assert.equal(result.snapshot.presentation.anchors[1].source, 'file');
    assert.ok(vscode.window.tabGroups.all.length <= 3); record('load', result.snapshot);
  });
  test('public navigation advances beats and stops and can return to an explicit cursor', async () => {
    let r = await api('kanko_tour_navigate', { action: 'nextBeat' }); assert.equal(r.snapshot.beat.id, 'proof');
    assert.ok(vscode.window.visibleTextEditors.some(e => e.document.uri.path.endsWith('service.test.js'))); record('next-beat', r.snapshot);
    r = await api('kanko_tour_navigate', { action: 'nextStop' }); assert.equal(r.snapshot.stop.id, 'navigation');
    r = await api('kanko_tour_navigate', { action: 'goto', stopId: 'navigation', beatId: 'removed' });
    const deleted = vscode.window.visibleTextEditors.find(e => e.document.uri.path.endsWith('retired.js'));
    assert.ok(deleted); assert.match(deleted.document.getText(), /openBeforeValidation/); record('deleted-base', r.snapshot);
    r = await api('kanko_tour_navigate', { action: 'previousStop' }); assert.equal(r.snapshot.beat.id, 'guard');
  });
  test('exploring keeps editors still, paused removes presentation, and following resumes the current beat', async () => {
    await api('kanko_tour_set_state', { mode: 'exploring' }); const before = tabs();
    let r = await api('kanko_tour_navigate', { action: 'nextBeat' }); assert.equal(r.snapshot.mode, 'exploring'); assert.deepEqual(tabs(), before); record('exploring', r.snapshot);
    r = await api('kanko_tour_set_state', { mode: 'paused' }); assert.equal(r.snapshot.mode, 'paused'); record('paused', r.snapshot);
    r = await api('kanko_tour_set_state', { mode: 'following' }); assert.equal(r.snapshot.beat.id, 'proof'); assert.ok(vscode.window.visibleTextEditors.some(e => e.document.uri.path.endsWith('service.test.js')));
  });
  test('the extension rejects invalid load findings before changing the current tour or tabs', async () => {
    const before = (await api('kanko_tour_status')).snapshot, beforeTabs = tabs();
    const bad = service.loadTour({ workspace: fixture.workspace, mapId: fixture.mapId }); bad.plan.stops[0].beats[0].active = [99];
    const result = await http('/tour/load', bad); assert.equal(result.ok, false); assert.equal(result.error.code, 'invalid_tour_plan');
    assert.ok(result.error.details.findings.some(f => f.code === 'invalid_active'));
    assert.deepEqual((await api('kanko_tour_status')).snapshot, before); assert.deepEqual(tabs(), beforeTabs); record('rejected-load', { result, unchangedSnapshot: before, unchangedTabs: beforeTabs });
  });
  test('stale navigation and retired stop/focus endpoints cannot mutate the tour', async () => {
    const before = (await api('kanko_tour_status')).snapshot;
    await assert.rejects(api('kanko_tour_navigate', { action: 'nextBeat', expectedRevision: 0 }), e => e.code === 'stale_presentation');
    for (const route of ['/stop', '/focus']) assert.equal((await http(route, { workspace: fixture.workspace })).ok, false);
    assert.deepEqual((await api('kanko_tour_status')).snapshot, before);
  });
  test('copy citation identifies the selected immutable source revision', async () => {
    const visible = vscode.window.visibleTextEditors.find(e => e.document.uri.path.endsWith('service.test.js'));
    const editor = await vscode.window.showTextDocument(visible.document, { preview: true, viewColumn: visible.viewColumn });
    const previousClipboard = await vscode.env.clipboard.readText();
    try {
      editor.selection = new vscode.Selection(2, 0, 4, 0);
      await sleep(100);
      const copied = await vscode.commands.executeCommand('kanko.copyCitation');
      assert.match(copied, /service.test.js:3-4 \[head@/); assert.equal(await vscode.env.clipboard.readText(), copied);
    } finally { await vscode.env.clipboard.writeText(previousClipboard); }
  });
  test('three active anchors share the cap and removed code falls back to peek', async () => {
    await api('kanko_tour_set_state', {mode:'following'});
    let r = await api('kanko_tour_navigate', {action:'goto',stopId:'validation',beatId:'capacity'});
    assert.equal(r.snapshot.presentation.anchors.filter(a=>a.status==='visible').length,3);
    assert.equal(r.snapshot.presentation.anchors[0].removedCode,'peek');
    assert.equal(vscode.window.tabGroups.all.length,3);
    for (const file of ['service.js','service.test.js','navigation.js']) assert.equal(tabs().filter(t=>t.uri && decodeURIComponent(t.uri).split('?')[0].endsWith('/'+file)).length,1);
    record('three-anchors-peek',r.snapshot);
    r = await api('kanko_tour_set_state', {mode:'exploring'});
    assert.equal(r.snapshot.presentation.anchors[0].removedCode,'peek');
    const focus = r.snapshot.stop.anchors[0].focus.find(f=>f.side==='base');
    const args = JSON.parse(JSON.stringify([r.snapshot.tourId,r.snapshot.stopIndex,1,focus.range.startLine,focus.range.endLine]));
    await vscode.commands.executeCommand('kanko.tour.peekRemoved',...args);
    assert.equal(vscode.window.tabGroups.all.length,3);
    await vscode.commands.executeCommand('closeReferenceSearch');
    record('peek-command-json-boundary',{arguments:args,retainedWhileExploring:true});
    // Native peek opens a plain source tab in place of a diff. End this
    // scenario with a fresh editor set so later ownership checks are isolated.
    await api('kanko_tour_clear');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await load();
    await api('kanko_tour_set_state', {mode:'following'});
    r = await api('kanko_tour_navigate',{action:'goto',stopId:'validation',beatId:'proof'});
  });
  test('disjoint anchors in one file reuse a tab and present the selected identity', async () => {
    const r = await api('kanko_tour_navigate',{action:'goto',stopId:'validation',beatId:'same-source'});
    assert.equal(r.snapshot.presentation.anchors.find(a=>a.n===4).status,'visible');
    assert.equal(r.snapshot.presentation.anchors.find(a=>a.n===1).status,'open');
    assert.equal(tabs().filter(t=>t.uri && decodeURIComponent(t.uri).split('?')[0].endsWith('/service.js')).length,1);
    record('same-source-identity',r.snapshot);
    await api('kanko_tour_navigate',{action:'goto',stopId:'validation',beatId:'proof'});
  });
  test('dirty matching head becomes immutable on the next presentation and survives cleanup', async () => {
    const original = vscode.window.visibleTextEditors.find(e=>e.document.uri.scheme==='file' && e.document.uri.path.endsWith('service.test.js'));
    const editor = await vscode.window.showTextDocument(original.document,{viewColumn:original.viewColumn});
    await editor.edit(edit=>edit.insert(new vscode.Position(0,0),'// reviewer edit\n'));
    await sleep(100);
    const changed = (await api('kanko_tour_status')).snapshot;
    assert.equal(changed.presentation.anchors.find(a=>a.n===2).status,'stale');
    const next = await api('kanko_tour_set_state',{mode:'following'});
    assert.equal(next.snapshot.presentation.anchors.find(a=>a.n===2).source,'kanko-rev');
    await api('kanko_tour_clear');
    assert.ok(tabs().some(t=>t.uri===editor.document.uri.toString()));
    assert.equal(editor.document.isDirty,true);
    record('dirty-head-protected',{stale:changed.presentation,immutable:next.snapshot.presentation});
    await vscode.window.showTextDocument(editor.document,{viewColumn:editor.viewColumn});
    await vscode.commands.executeCommand('workbench.action.files.revert');
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await load();
  });
  test('pinned tour tabs survive stop changes while ordinary owned previews close', async () => {
    const tab = vscode.window.tabGroups.all.flatMap(g=>g.tabs).find(t=>t.input?.modified?.path.endsWith('/service.js'));
    assert.ok(tab);
    const group = vscode.window.tabGroups.all.find(g=>g.tabs.includes(tab));
    await vscode.commands.executeCommand('vscode.diff',tab.input.original,tab.input.modified,tab.label,{viewColumn:group.viewColumn,preview:false});
    await api('kanko_tour_navigate',{action:'nextStop'});
    assert.ok(vscode.window.tabGroups.all.some(g=>g.tabs.includes(tab)));
    assert.ok(!tabs().some(t=>t.uri && decodeURIComponent(t.uri).split('?')[0].endsWith('/service.test.js')));
    record('pinned-tab-protected',{labels:tabs().map(t=>t.label)});
    await api('kanko_tour_clear');
    await vscode.window.tabGroups.close(tab,true);
    await load();
  });
  test('a reviewer-owned preview survives loading and ending a tour', async () => {
    await api('kanko_tour_clear');
    const note = vscode.Uri.file(path.join(fixture.workspace,'reviewer-notes.txt'));
    fs.writeFileSync(note.fsPath,'Reviewer notes outside the authored tour.\n');
    const editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(note),{preview:true,viewColumn:1});
    const userTab = vscode.window.tabGroups.all.flatMap(g=>g.tabs).find(t=>t.input?.uri?.toString()===note.toString());
    assert.ok(userTab.isPreview);
    await load();
    assert.ok(vscode.window.tabGroups.all.some(g=>g.tabs.includes(userTab)));
    await api('kanko_tour_clear');
    assert.ok(vscode.window.tabGroups.all.some(g=>g.tabs.includes(userTab)));
    record('reviewer-preview-protected',{uri:'reviewer-notes.txt',preserved:true});
    await vscode.window.tabGroups.close(userTab,true);
    fs.unlinkSync(note.fsPath);
    await load();
  });
  test('reusing a real file retains the pinned base source for seam peek', async () => {
    await api('kanko_tour_clear');
    const config = vscode.workspace.getConfiguration('kanko.presentation');
    await config.update('removedCode','seam',vscode.ConfigurationTarget.Workspace);
    const real = vscode.Uri.file(path.join(fixture.workspace,'service.js'));
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(real),{preview:false,viewColumn:1});
    const r = await load();
    assert.equal(r.snapshot.presentation.anchors[0].removedCode,'peek');
    assert.equal(tabs().filter(t=>t.uri===real.toString()).length,1);
    const payload = service.loadTour({workspace:fixture.workspace,mapId:fixture.mapId});
    const a = payload.plan.stops[0].anchors[0];
    const base = vscode.Uri.from({scheme:'kanko-rev',path:'/'+a.path,query:JSON.stringify({path:path.join(fixture.workspace,a.path),ref:a.rev.base,side:'base',kanko:'tour',identity:payload.change.manifestDigest})});
    const document = await vscode.workspace.openTextDocument(base);
    assert.match(document.getText(),/current: null/);
    record('retained-peek-source',{reusedRealFile:true,pinnedBaseAvailable:true});
    await api('kanko_tour_clear');
    const user = vscode.window.tabGroups.all.flatMap(g=>g.tabs).find(t=>t.input?.uri?.toString()===real.toString());
    await vscode.window.tabGroups.close(user,true);
    await config.update('removedCode',undefined,vscode.ConfigurationTarget.Workspace);
    await load();
  });
  test('clear ends presentation without recording review acceptance, then reload begins at the first beat', async () => {
    let r = await api('kanko_tour_clear'); assert.equal(r.snapshot.loaded, false);
    const state = service.locate(fixture.workspace, fixture.mapId).state;
    assert.equal(Object.keys(state.reviewSessions).length, 0); assert.equal(state.phase, 'prepared');
    r = await load(); assert.equal(r.snapshot.beat.id, 'guard'); record('reloaded', r.snapshot);
  });
  let fixtureNumber=0;
  const layoutCommand = body => vscode.commands.executeCommand('kanko.tour.layout', body);
  const layoutConfig = vscode.workspace.getConfiguration('kanko.layout');
  async function layoutFixture({cap=3,beat='pair',sequence=false,single=false}={}) {
    await api('kanko_tour_clear');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('workbench.action.editorLayoutSingle');
    await layoutConfig.update('maxGroups',cap,vscode.ConfigurationTarget.Workspace);
    await layoutConfig.update('sequenceFallback',sequence,vscode.ConfigurationTarget.Workspace);
    const payload=service.loadTour({workspace:fixture.workspace,mapId:fixture.mapId});
    const stop=payload.plan.stops.find(s=>s.id==='layout');
    stop.beats=[...stop.beats.filter(b=>b.id===beat),...stop.beats.filter(b=>b.id!==beat)];
    if(single)stop.beats[0].active=[1];
    payload.plan.stops=[stop];payload.plan.title='Reviewer-controlled layouts';payload.tourId += `-layout-${++fixtureNumber}`;
    const result=await http('/tour/load',payload);assert.equal(result.ok,true,JSON.stringify(result));return result.snapshot;
  }
  test('layout caps 2, 3 and 4 produce stack, split bottom and grid without duplicating visible anchors',async()=>{
    const shapes={2:'stack',3:'stackSplitBottom',4:'grid'};
    for(const cap of [2,3,4]){
      const s=await layoutFixture({cap,beat:'four'});
      assert.equal(s.presentation.layout.shape,shapes[cap]);assert.equal(vscode.window.tabGroups.all.length,cap);
      assert.equal(s.presentation.anchors.filter(a=>a.status==='visible').length,cap);
      const before=await vscode.commands.executeCommand('vscode.getEditorLayout'),beforeTabs=tabs();
      await api('kanko_tour_navigate',{action:'goto',stopId:'layout',beatId:'four'});
      assert.deepEqual(await vscode.commands.executeCommand('vscode.getEditorLayout'),before);assert.deepEqual(tabs(),beforeTabs);
      record(`layout-cap-${cap}`,{snapshot:s,geometry:before});
    }
  });
  test('tour pins block all replacement and unpinning makes exactly that group eligible',async()=>{
    await layoutFixture({cap:2});
    for(const anchor of [1,2])await layoutCommand({action:'pin',anchor,pinned:true});
    const before=tabs();let r=await api('kanko_tour_navigate',{action:'goto',stopId:'layout',beatId:'missing'});
    assert.deepEqual(tabs(),before);assert.deepEqual(r.snapshot.presentation.layout.unplaced,[3]);
    record('all-pinned',r.snapshot);
    await layoutCommand({action:'pin',anchor:2,pinned:false});
    r=await api('kanko_tour_navigate',{action:'goto',stopId:'layout',beatId:'missing'});
    assert.equal(r.snapshot.presentation.anchors.find(a=>a.n===1).status,'visible');
    assert.equal(r.snapshot.presentation.anchors.find(a=>a.n===2).status,'not-open');
    assert.equal(r.snapshot.presentation.anchors.find(a=>a.n===3).column,2);record('unpin-replace',r.snapshot);
  });
  test('reviewer resize prevents growth and Exploring leaves both geometry and editors alone',async()=>{
    await layoutFixture();
    await vscode.commands.executeCommand('vscode.setEditorLayout',{orientation:1,groups:[{size:.7},{size:.3}]});
    const before=await vscode.commands.executeCommand('vscode.getEditorLayout');
    let r=await api('kanko_tour_navigate',{action:'goto',stopId:'layout',beatId:'four'});
    assert.equal(r.snapshot.presentation.layout.customized,true);assert.equal(vscode.window.tabGroups.all.length,2);
    assert.deepEqual(await vscode.commands.executeCommand('vscode.getEditorLayout'),before);
    await api('kanko_tour_set_state',{mode:'exploring'});const beforeTabs=tabs();
    r=await api('kanko_tour_navigate',{action:'goto',stopId:'layout',beatId:'long'});
    assert.deepEqual(tabs(),beforeTabs);assert.deepEqual(await vscode.commands.executeCommand('vscode.getEditorLayout'),before);
    record('customized-exploring',{snapshot:r.snapshot,geometry:before});
  });
  test('placements split either row, validate caps, and retain remembered role destinations',async()=>{
    await vscode.workspace.getConfiguration('workbench.editor').update('closeEmptyGroups',true,vscode.ConfigurationTarget.Workspace);
    await layoutFixture({single:true});
    let s=await layoutCommand({action:'place',anchor:2,placement:{kind:'below',of:1},remember:true});
    assert.equal(s.presentation.layout.shape,'stack');assert.equal(s.presentation.layout.preferences.evidence.slot,'bottom');
    s=await layoutCommand({action:'place',anchor:3,placement:{kind:'beside',of:1}});
    assert.equal(s.presentation.layout.shape,'stackSplitTop');
    assert.equal(s.presentation.anchors.find(a=>a.n===1).column,1);assert.equal(s.presentation.anchors.find(a=>a.n===3).column,2);assert.equal(s.presentation.anchors.find(a=>a.n===2).column,3);
    assert.ok(!s.presentation.layout.options[4].some(p=>['below','beside'].includes(p.kind)));
    await assert.rejects(layoutCommand({action:'place',anchor:4,placement:{kind:'below',of:1}}),/no longer available/);
    record('split-top',s);
    await layoutFixture({single:true});await layoutCommand({action:'place',anchor:2,placement:{kind:'below',of:1},remember:true});
    s=await layoutCommand({action:'place',anchor:3,placement:{kind:'beside',of:2}});
    assert.equal(s.presentation.layout.shape,'stackSplitBottom');record('split-bottom',s);
    await layoutFixture({single:true});await layoutCommand({action:'place',anchor:2,placement:{kind:'below',of:1},remember:true});
    const r=await api('kanko_tour_navigate',{action:'goto',stopId:'layout',beatId:'long'});
    assert.equal(r.snapshot.presentation.anchors.find(a=>a.n===5).column,2);record('remember-role',r.snapshot);
    await layoutFixture({single:true});
    s=await layoutCommand({action:'place',anchor:2,placement:{kind:'beside',of:1}});
    assert.equal(s.presentation.layout.shape,'columns');record('columns',s);
    await vscode.workspace.getConfiguration('workbench.editor').update('closeEmptyGroups',undefined,vscode.ConfigurationTarget.Workspace);
  });
  test('customized companion groups survive native empty-group cleanup and pins block growth',async()=>{
    await api('kanko_tour_clear');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('workbench.action.editorLayoutSingle');
    await vscode.workspace.getConfiguration('workbench.editor').update('closeEmptyGroups',true,vscode.ConfigurationTarget.Workspace);
    await load();
    await vscode.commands.executeCommand('vscode.setEditorLayout',{orientation:1,groups:[{size:.6},{size:.4,groups:[{},{}]}]});
    const before=await vscode.commands.executeCommand('vscode.getEditorLayout');
    const r=await api('kanko_tour_navigate',{action:'nextBeat'});
    assert.deepEqual(await vscode.commands.executeCommand('vscode.getEditorLayout'),before);
    assert.equal(r.snapshot.presentation.layout.customized,true);record('custom-companion-retained',r.snapshot);
    await layoutFixture({cap:4});await layoutCommand({action:'pin',anchor:1,pinned:true});
    const pinned=await api('kanko_tour_navigate',{action:'goto',stopId:'layout',beatId:'four'});
    assert.equal(vscode.window.tabGroups.all.length,2);assert.equal(pinned.snapshot.presentation.anchors.find(a=>a.n===1).status,'visible');record('pin-blocks-growth',pinned.snapshot);
    await vscode.workspace.getConfiguration('workbench.editor').update('closeEmptyGroups',undefined,vscode.ConfigurationTarget.Workspace);
  });
  test('cramped long sources use Sequence and the one-click override restores multiple groups',async()=>{
    await vscode.workspace.getConfiguration('editor').update('fontSize',38,vscode.ConfigurationTarget.Workspace);
    let s=await layoutFixture({beat:'long',sequence:true});
    assert.equal(s.presentation.layout.sequence,true);assert.equal(vscode.window.tabGroups.all.length,1);record('sequence',s);
    s=await layoutCommand({action:'overrideSequence'});
    assert.equal(s.presentation.layout.sequence,false);assert.equal(s.presentation.layout.sequenceOverride,true);assert.equal(vscode.window.tabGroups.all.length,2);record('sequence-override',s);
    await vscode.workspace.getConfiguration('editor').update('fontSize',undefined,vscode.ConfigurationTarget.Workspace);
    await layoutFixture({cap:2});
  });

  async function sidebarFixture({count=9,cap=3}={}) {
    await api('kanko_tour_clear');await vscode.commands.executeCommand('workbench.action.closeAllEditors');await vscode.commands.executeCommand('workbench.action.editorLayoutSingle');
    await layoutConfig.update('maxGroups',cap,vscode.ConfigurationTarget.Workspace);
    await layoutConfig.update('sequenceFallback',false,vscode.ConfigurationTarget.Workspace);
    await vscode.workspace.getConfiguration('kanko.tour').update('anchorLimit',99,vscode.ConfigurationTarget.Workspace);
    const payload=service.loadTour({workspace:fixture.workspace,mapId:fixture.mapId}),stop=payload.plan.stops.find(s=>s.id==='sidebar');
    if(count<=9){stop.anchors=stop.anchors.slice(0,count);if(count<9)stop.beats=stop.beats.slice(0,1);}
    else {
      const {tourSources}=require('../../../contract/tour-sources.js'),{hashText,rangeText}=require('../../../contract/tour.js');
      const source=tourSources(fixture.workspace,payload.change);
      stop.anchors=Array.from({length:count},(_,i)=>{const a={...stop.anchors[0],n:i+1,path:`source-${i+1}.js`,role:['change','evidence','callee','caller','config','schema','context'][i%7],label:`Inventory source ${i+1}`,context:{startLine:1,endLine:2},focus:[],change:'added'};a.contentHash=hashText(rangeText(source.readSource(a).head,a.context));return a;});
      stop.beats=[{id:'large',narration:`{{a:1}} and {{a:2}} are active. Find {{a:${count}}} using the file picker.`,active:[1,2]}];
    }
    if(count===1)stop.beats=[{id:'first',narration:'{{a:1}} preserves the active review.',active:[1]}];
    payload.plan.stops=[stop];payload.plan.title='The complete stop, one beat at a time';payload.tourId += `-sidebar-${++fixtureNumber}`;
    const r=await http('/tour/load',payload);assert.equal(r.ok,true,JSON.stringify(r));return r.snapshot;
  }
  test('stop inventory retains all seven roles and every anchor across beats',async()=>{
    const first=await sidebarFixture();assert.equal(first.stop.anchors.length,9);assert.equal(new Set(first.stop.anchors.map(a=>a.role)).size,7);
    const next=(await api('kanko_tour_navigate',{action:'nextBeat'})).snapshot;
    assert.deepEqual(next.stop.anchors,first.stop.anchors);assert.notDeepEqual(next.beat.active,first.beat.active);record('stop-wide-inventory',{first,next});
  });
  test('explicit move reuses the native tab and reset retains role preferences',async()=>{
    await sidebarFixture({count:3});
    let s=await layoutCommand({action:'place',anchor:3,placement:{kind:'replace',of:2},remember:true});
    const before=tabs().filter(t=>t.uri?.includes('/navigation.js')).length;
    s=await layoutCommand({action:'place',anchor:3,placement:{kind:'replace',of:1}});
    assert.equal(s.presentation.anchors.find(a=>a.n===3).column,1);assert.equal(tabs().filter(t=>t.uri?.includes('/navigation.js')).length,before);
    await layoutCommand({action:'pin',anchor:3,pinned:true});s=await layoutCommand({action:'reset'});
    assert.ok(s.presentation.layout.slots.every(s=>!s.pinned));assert.equal(s.presentation.layout.preferences.caller.slot,'bottom');record('move-reset',s);
  });
  test('moving from an emptying group tolerates native group renumbering',async()=>{
    await sidebarFixture({count:3});await vscode.workspace.getConfiguration('workbench.editor').update('closeEmptyGroups',true,vscode.ConfigurationTarget.Workspace);
    let preview;
    for(let attempt=0;attempt<20;attempt++){
      const before=(await api('kanko_tour_status')).snapshot;
      preview=before.presentation.layout.options[1].find(o=>o.kind==='replace'&&o.of===2).preview;
      if(preview.length===1)break;await sleep(50);
    }
    assert.deepEqual(preview,[{x:0,y:0,w:1,h:1,anchor:1}]);
    const s=await layoutCommand({action:'place',anchor:1,placement:{kind:'replace',of:2}});
    assert.equal(s.presentation.anchors.find(a=>a.n===1).status,'visible');assert.equal(tabs().filter(t=>t.uri?.includes('/service.js')).length,1);record('move-renumbered-group',s);
    await vscode.workspace.getConfiguration('workbench.editor').update('closeEmptyGroups',undefined,vscode.ConfigurationTarget.Workspace);
  });
  test('99 source-backed anchors load within the configured ceiling',async()=>{
    const s=await sidebarFixture({count:99});assert.equal(s.stop.anchors.length,99);assert.equal(s.presentation.layout.slots.length,2);record('large-stop',s);
  });

  test('every required anchor count loads with a complete inventory and bounded tabs',async()=>{
    for(const count of [1,3,7,12,24,99]) {
      const s=await sidebarFixture({count});assert.equal(s.stop.anchors.length,count);
      assert.ok(tabs().length<=3);assert.deepEqual(s.stop.anchors.map(a=>a.n),Array.from({length:count},(_,i)=>i+1));
      record(`inventory-${count}`,s);
    }
  });
  async function persistenceFixture() {
    await api('kanko_tour_clear');await vscode.commands.executeCommand('workbench.action.closeAllEditors');await vscode.commands.executeCommand('workbench.action.editorLayoutSingle');
    await layoutConfig.update('maxGroups',3,vscode.ConfigurationTarget.Workspace);await layoutConfig.update('sequenceFallback',false,vscode.ConfigurationTarget.Workspace);
    const payload=service.loadTour({workspace:fixture.workspace,mapId:fixture.mapId});
    payload.tourId+=`-persistence-${++fixtureNumber}`;
    payload.plan.stops=payload.plan.stops.filter(s=>['sidebar','navigation'].includes(s.id)).reverse();
    // The first stop uses the service and regression as single sources.
    const r=await http('/tour/load',payload);assert.equal(r.ok,true,JSON.stringify(r));return payload;
  }
  test('native return and reload restore resized arrangements, pins and remembered roles',async()=>{
    const payload=await persistenceFixture();
    await layoutCommand({action:'place',anchor:3,placement:{kind:'replace',of:2},remember:true});
    await vscode.commands.executeCommand('vscode.setEditorLayout',{orientation:1,groups:[{size:.65},{size:.35}]});
    const geometry=await vscode.commands.executeCommand('vscode.getEditorLayout');
    await api('kanko_tour_navigate',{action:'nextStop'});
    let s=(await api('kanko_tour_navigate',{action:'previousStop'})).snapshot;
    assert.deepEqual(s.presentation.layout.slots.map(s=>s.anchor),[1,3]);assert.deepEqual(await vscode.commands.executeCommand('vscode.getEditorLayout'),geometry);
    await layoutCommand({action:'pin',anchor:3,pinned:true});
    await api('kanko_tour_clear');await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    s=(await http('/tour/load',payload)).snapshot;
    assert.deepEqual(s.presentation.layout.slots.map(s=>s.anchor),[1,3]);assert.equal(s.presentation.layout.slots[1].pinned,true);
    assert.equal(s.presentation.layout.preferences.caller.slot,'bottom');record('persisted-return-reload',s);
    s=await layoutCommand({action:'reset'});assert.ok(s.presentation.layout.slots.every(s=>!s.pinned));assert.equal(s.presentation.layout.preferences.caller.slot,'bottom');
  });
  test('closed tabs are reconciled before return and rapid navigation does not accumulate previews',async()=>{
    await persistenceFixture();
    const second=vscode.window.tabGroups.all.find(g=>g.viewColumn===2).activeTab;
    await vscode.window.tabGroups.close(second,true);
    await api('kanko_tour_navigate',{action:'nextStop'});
    let s=(await api('kanko_tour_navigate',{action:'previousStop'})).snapshot;
    assert.equal(s.presentation.anchors.find(a=>a.n===2).status,'not-open');record('closed-anchor-return',s);
    const actions=Array.from({length:12},(_,i)=>api('kanko_tour_navigate',{action:i%2?'previousStop':'nextStop'}));
    const responses=await Promise.all(actions);assert.ok(responses.every(r=>r.snapshot));
    assert.ok(tabs().length<=3);record('rapid-navigation',{snapshot:(await api('kanko_tour_status')).snapshot,tabs:tabs()});
  });
  test('pause closes unclaimed tour tabs and retains dirty reviewer work',async()=>{
    await persistenceFixture();
    let s=(await api('kanko_tour_set_state',{mode:'paused'})).snapshot;
    assert.equal(tabs().length,0);assert.equal(vscode.window.tabGroups.all.length,1);
    await api('kanko_tour_set_state',{mode:'following'});assert.equal(tabs().length,2);
    const doc=await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(fixture.workspace,'service.js')));
    const edit=new vscode.WorkspaceEdit();edit.insert(doc.uri,new vscode.Position(0,0),'// Reviewer draft\n');await vscode.workspace.applyEdit(edit);
    s=(await api('kanko_tour_set_state',{mode:'paused'})).snapshot;
    assert.equal(doc.isDirty,true);assert.ok(tabs().some(t=>t.uri?.endsWith('/service.js')));record('paused-dirty',s);
    await vscode.window.showTextDocument(doc);await vscode.commands.executeCommand('workbench.action.files.revert');
  });

  if (process.env.KANKO_TOUR_MANUAL) test('manual screenshot acceptance session', async () => {
    fs.writeFileSync(path.join(output, 'ready.json'), JSON.stringify({ workspace: fixture.workspace, stateRoot: fixture.stateRoot, mapId: fixture.mapId }));
    const file = path.join(output, 'control.json'); const deadline = Date.now() + 20 * 60 * 1000;
    while (Date.now() < deadline) {
      if (fs.existsSync(file)) {
        let command;
        try { command = JSON.parse(fs.readFileSync(file)); } catch (error) { if (!(error instanceof SyntaxError)) throw error; await sleep(200); continue; }
        fs.unlinkSync(file);
        if (command.action === 'finish') return;
        let result;
        if (command.action === 'sidebar') result = await sidebarFixture(command.options);
        else if (command.action === 'persistence') { const payload=await persistenceFixture(); fs.writeFileSync(path.join(output,'reload-payload.json'),JSON.stringify(payload)); result=(await api('kanko_tour_status')).snapshot; }
        else if (command.action === 'layout') result = await layoutFixture(command.options);
        else if (command.action === 'load') result = await load();
        else if (command.action === 'invalid') { const bad = service.loadTour({ workspace: fixture.workspace, mapId: fixture.mapId }); bad.plan.stops[0].beats[0].active = [99]; result = await http('/tour/load', bad); }
        else if (command.action === 'snapshot') result = await api('kanko_tour_status');
        else throw new Error('Unknown fixture control action');
        fs.writeFileSync(path.join(output, `manual-${command.id}.json`), JSON.stringify({ result, tabs: tabs() }, null, 2));
      }
      await sleep(200);
    }
    throw new Error('Screenshot session timed out');
  });
};
