"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vscode = require('vscode');
const { DossierService } = require('../../../mcp/lib/dossier/service.js');
const { createCallTool } = require('../../../mcp/lib/tools.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
module.exports = function register({ test, before }) {
  const fixture = JSON.parse(fs.readFileSync(process.env.RELAY_TOUR_FIXTURE));
  const output = process.env.RELAY_TOUR_OUTPUT;
  const service = new DossierService({ root: fixture.stateRoot });
  let lock, call;
  const results = [];
  const record = (name, value) => { results.push({ name, value }); fs.writeFileSync(path.join(output, 'automated.json'), JSON.stringify({ vscode: vscode.version, results }, null, 2)); };
  const api = (name, args = {}) => call(name, { workspace: fixture.workspace, ...args });
  const load = () => api('relay_load_tour', { dossierId: fixture.dossierId });
  const http = async (route, body) => (await fetch(`http://127.0.0.1:${lock.port}${route}`, { method: 'POST', headers: { authorization: `Bearer ${lock.authToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...body, protocolVersion: 2 }) })).json();
  const tabs = () => vscode.window.tabGroups.all.flatMap(g => g.tabs.map(t => ({ label: t.label, uri: (t.input?.uri || t.input?.modified)?.toString() })));
  before(async () => {
    await vscode.extensions.getExtension('erstaples.kanko').activate();
    const dir = path.join(os.homedir(), '.claude/tour');
    lock = fs.readdirSync(dir).filter(n => n.endsWith('.lock')).map(n => JSON.parse(fs.readFileSync(path.join(dir, n)))).find(l => l.pid === process.pid);
    assert.ok(lock); call = createCallTool({ dossierService: service, resolveLock: () => lock });
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
    let r = await api('relay_navigate', { action: 'nextBeat' }); assert.equal(r.snapshot.beat.id, 'proof');
    assert.ok(vscode.window.visibleTextEditors.some(e => e.document.uri.path.endsWith('service.test.js'))); record('next-beat', r.snapshot);
    r = await api('relay_navigate', { action: 'nextStop' }); assert.equal(r.snapshot.stop.id, 'navigation');
    r = await api('relay_navigate', { action: 'goto', stopId: 'navigation', beatId: 'removed' });
    const deleted = vscode.window.visibleTextEditors.find(e => e.document.uri.path.endsWith('retired.js'));
    assert.ok(deleted); assert.match(deleted.document.getText(), /openBeforeValidation/); record('deleted-base', r.snapshot);
    r = await api('relay_navigate', { action: 'previousStop' }); assert.equal(r.snapshot.beat.id, 'guard');
  });
  test('exploring keeps editors still, paused removes presentation, and following resumes the current beat', async () => {
    await api('relay_set_state', { mode: 'exploring' }); const before = tabs();
    let r = await api('relay_navigate', { action: 'nextBeat' }); assert.equal(r.snapshot.mode, 'exploring'); assert.deepEqual(tabs(), before); record('exploring', r.snapshot);
    r = await api('relay_set_state', { mode: 'paused' }); assert.equal(r.snapshot.mode, 'paused'); record('paused', r.snapshot);
    r = await api('relay_set_state', { mode: 'following' }); assert.equal(r.snapshot.beat.id, 'proof'); assert.ok(vscode.window.visibleTextEditors.some(e => e.document.uri.path.endsWith('service.test.js')));
  });
  test('the extension rejects invalid load findings before changing the current tour or tabs', async () => {
    const before = (await api('tour_status')).snapshot, beforeTabs = tabs();
    const bad = service.loadTour({ workspace: fixture.workspace, dossierId: fixture.dossierId }); bad.plan.stops[0].beats[0].active = [99];
    const result = await http('/tour/load', bad); assert.equal(result.ok, false); assert.equal(result.error.code, 'invalid_tour_plan');
    assert.ok(result.error.details.findings.some(f => f.code === 'invalid_active'));
    assert.deepEqual((await api('tour_status')).snapshot, before); assert.deepEqual(tabs(), beforeTabs); record('rejected-load', { result, unchangedSnapshot: before, unchangedTabs: beforeTabs });
  });
  test('stale navigation and retired stop/focus endpoints cannot mutate the tour', async () => {
    const before = (await api('tour_status')).snapshot;
    await assert.rejects(api('relay_navigate', { action: 'nextBeat', expectedRevision: 0 }), e => e.code === 'stale_presentation');
    for (const route of ['/stop', '/focus']) assert.equal((await http(route, { workspace: fixture.workspace })).ok, false);
    assert.deepEqual((await api('tour_status')).snapshot, before);
  });
  test('copy citation identifies the selected immutable source revision', async () => {
    const visible = vscode.window.visibleTextEditors.find(e => e.document.uri.path.endsWith('service.test.js'));
    const editor = await vscode.window.showTextDocument(visible.document, { preview: true, viewColumn: visible.viewColumn });
    const previousClipboard = await vscode.env.clipboard.readText();
    try {
      editor.selection = new vscode.Selection(2, 0, 4, 0);
      const copied = await vscode.commands.executeCommand('tourChanges.copyCitation');
      assert.match(copied, /service.test.js:3-4 \[head@/); assert.equal(await vscode.env.clipboard.readText(), copied);
    } finally { await vscode.env.clipboard.writeText(previousClipboard); }
  });
  test('three active anchors share the cap and removed code falls back to peek', async () => {
    await api('relay_set_state', {mode:'following'});
    let r = await api('relay_navigate', {action:'goto',stopId:'validation',beatId:'capacity'});
    assert.equal(r.snapshot.presentation.anchors.filter(a=>a.status==='visible').length,3);
    assert.equal(r.snapshot.presentation.anchors[0].removedCode,'peek');
    assert.equal(vscode.window.tabGroups.all.length,3);
    for (const file of ['service.js','service.test.js','navigation.js']) assert.equal(tabs().filter(t=>t.uri && decodeURIComponent(t.uri).split('?')[0].endsWith('/'+file)).length,1);
    record('three-anchors-peek',r.snapshot);
    r = await api('relay_navigate',{action:'goto',stopId:'validation',beatId:'proof'});
  });
  test('disjoint anchors in one file reuse a tab and present the selected identity', async () => {
    const r = await api('relay_navigate',{action:'goto',stopId:'validation',beatId:'same-source'});
    assert.equal(r.snapshot.presentation.anchors.find(a=>a.n===4).status,'visible');
    assert.equal(r.snapshot.presentation.anchors.find(a=>a.n===1).status,'open');
    assert.equal(tabs().filter(t=>t.uri && decodeURIComponent(t.uri).split('?')[0].endsWith('/service.js')).length,1);
    record('same-source-identity',r.snapshot);
    await api('relay_navigate',{action:'goto',stopId:'validation',beatId:'proof'});
  });
  test('dirty matching head becomes immutable on the next presentation and survives cleanup', async () => {
    const original = vscode.window.visibleTextEditors.find(e=>e.document.uri.scheme==='file' && e.document.uri.path.endsWith('service.test.js'));
    const editor = await vscode.window.showTextDocument(original.document,{viewColumn:original.viewColumn});
    await editor.edit(edit=>edit.insert(new vscode.Position(0,0),'// reviewer edit\n'));
    await sleep(100);
    const changed = (await api('tour_status')).snapshot;
    assert.equal(changed.presentation.anchors.find(a=>a.n===2).status,'stale');
    const next = await api('relay_set_state',{mode:'following'});
    assert.equal(next.snapshot.presentation.anchors.find(a=>a.n===2).source,'relay-rev');
    await api('tour_clear');
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
    await api('relay_navigate',{action:'nextStop'});
    assert.ok(vscode.window.tabGroups.all.some(g=>g.tabs.includes(tab)));
    assert.ok(!tabs().some(t=>t.uri && decodeURIComponent(t.uri).split('?')[0].endsWith('/service.test.js')));
    record('pinned-tab-protected',{labels:tabs().map(t=>t.label)});
    await api('tour_clear');
    await vscode.window.tabGroups.close(tab,true);
    await load();
  });
  test('a reviewer-owned preview survives loading and ending a tour', async () => {
    await api('tour_clear');
    const note = vscode.Uri.file(path.join(fixture.workspace,'reviewer-notes.txt'));
    fs.writeFileSync(note.fsPath,'Reviewer notes outside the authored tour.\n');
    const editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(note),{preview:true,viewColumn:1});
    const userTab = vscode.window.tabGroups.all.flatMap(g=>g.tabs).find(t=>t.input?.uri?.toString()===note.toString());
    assert.ok(userTab.isPreview);
    await load();
    assert.ok(vscode.window.tabGroups.all.some(g=>g.tabs.includes(userTab)));
    await api('tour_clear');
    assert.ok(vscode.window.tabGroups.all.some(g=>g.tabs.includes(userTab)));
    record('reviewer-preview-protected',{uri:'reviewer-notes.txt',preserved:true});
    await vscode.window.tabGroups.close(userTab,true);
    fs.unlinkSync(note.fsPath);
    await load();
  });
  test('reusing a real file retains the pinned base source for seam peek', async () => {
    await api('tour_clear');
    const config = vscode.workspace.getConfiguration('relay.presentation');
    await config.update('removedCode','seam',vscode.ConfigurationTarget.Workspace);
    const real = vscode.Uri.file(path.join(fixture.workspace,'service.js'));
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(real),{preview:false,viewColumn:1});
    const r = await load();
    assert.equal(r.snapshot.presentation.anchors[0].removedCode,'peek');
    assert.equal(tabs().filter(t=>t.uri===real.toString()).length,1);
    const payload = service.loadTour({workspace:fixture.workspace,dossierId:fixture.dossierId});
    const a = payload.plan.stops[0].anchors[0];
    const base = vscode.Uri.from({scheme:'relay-rev',path:'/'+a.path,query:JSON.stringify({path:path.join(fixture.workspace,a.path),ref:a.rev.base,side:'base',relay:'tour',identity:payload.change.manifestDigest})});
    const document = await vscode.workspace.openTextDocument(base);
    assert.match(document.getText(),/current: null/);
    record('retained-peek-source',{reusedRealFile:true,pinnedBaseAvailable:true});
    await api('tour_clear');
    const user = vscode.window.tabGroups.all.flatMap(g=>g.tabs).find(t=>t.input?.uri?.toString()===real.toString());
    await vscode.window.tabGroups.close(user,true);
    await config.update('removedCode',undefined,vscode.ConfigurationTarget.Workspace);
    await load();
  });
  test('clear ends presentation without recording review acceptance, then reload begins at the first beat', async () => {
    let r = await api('tour_clear'); assert.equal(r.snapshot.loaded, false);
    const state = service.locate(fixture.workspace, fixture.dossierId).state;
    assert.equal(Object.keys(state.reviewSessions).length, 0); assert.equal(state.phase, 'prepared');
    r = await load(); assert.equal(r.snapshot.beat.id, 'guard'); record('reloaded', r.snapshot);
  });
  if (process.env.RELAY_TOUR_MANUAL) test('manual screenshot acceptance session', async () => {
    fs.writeFileSync(path.join(output, 'ready.json'), JSON.stringify({ workspace: fixture.workspace, stateRoot: fixture.stateRoot, dossierId: fixture.dossierId }));
    const file = path.join(output, 'control.json'); const deadline = Date.now() + 20 * 60 * 1000;
    while (Date.now() < deadline) {
      if (fs.existsSync(file)) {
        const command = JSON.parse(fs.readFileSync(file)); fs.unlinkSync(file);
        if (command.action === 'finish') return;
        let result;
        if (command.action === 'load') result = await load();
        else if (command.action === 'invalid') { const bad = service.loadTour({ workspace: fixture.workspace, dossierId: fixture.dossierId }); bad.plan.stops[0].beats[0].active = [99]; result = await http('/tour/load', bad); }
        else if (command.action === 'snapshot') result = await api('tour_status');
        else throw new Error('Unknown fixture control action');
        fs.writeFileSync(path.join(output, `manual-${command.id}.json`), JSON.stringify({ result, tabs: tabs() }, null, 2));
      }
      await sleep(200);
    }
    throw new Error('Screenshot session timed out');
  });
};
