"use strict";
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { DossierService } = require('../../../mcp/lib/dossier/service.js');
const { tourSources } = require('../../../contract/tour-sources.js');
const { hashText, rangeText } = require('../../../contract/tour.js');
function createFixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'relay-tour-')));
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace);
  const git = (...args) => cp.execFileSync('git', ['-C', workspace, ...args], { encoding: 'utf8' }).trim();
  const write = (file, text) => fs.writeFileSync(path.join(workspace, file), text);
  git('init', '-q');
  const serviceText = `export function loadTour(candidate, current) {\n  const findings = validateTour(candidate);\n\n  // Preserve the current display when validation fails.\n  if (findings.some(item => item.severity === 'error')) {\n    return { ok: false, findings, current };\n  }\n\n  const tour = normalizeAnchors(candidate);\n  return { ok: true, findings, current: tour };\n}\n\nfunction validateTour(tour) {\n  return tour.validationFindings ?? [];\n}\n\nfunction normalizeAnchors(tour) {\n  return { ...tour, validated: true };\n}\n`;
  write('service.js', serviceText.replace('return { ok: false, findings, current };', 'return { ok: false, findings, current: null };'));
  write('retired.js', 'export function openBeforeValidation(tour) {\n  openEditors(tour);\n  return validateTour(tour);\n}\n');
  git('add', '.'); git('-c', 'user.name=Relay Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
  write('service.js', serviceText);
  write('service.test.js', `import assert from 'node:assert/strict';\nimport { loadTour } from './service.js';\n\nconst current = { id: 'review-in-progress' };\nconst invalid = { validationFindings: [\n  { severity: 'error', code: 'missing_anchor' },\n] };\n\nconst result = loadTour(invalid, current);\nassert.equal(result.ok, false);\nassert.equal(result.current, current);\nassert.equal(result.findings[0].code, 'missing_anchor');\n\n// A valid candidate can replace the presentation.\nconst next = loadTour({ id: 'validated-tour' }, current);\nassert.equal(next.ok, true);\nassert.equal(next.current.validated, true);\n`);
  write('navigation.js', `export function nextBeat(state) {\n  const next = state.beatIndex + 1;\n  if (next >= state.stop.beats.length) {\n    return nextStop(state);\n  }\n  return { ...state, beatIndex: next };\n}\n\nexport function pause(state) {\n  return { ...state, mode: 'paused' };\n}\n`);
  fs.unlinkSync(path.join(workspace, 'retired.js')); git('add', '-A'); git('-c', 'user.name=Relay Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'head'); const head = git('rev-parse', 'HEAD');
  const stateRoot = path.join(root, 'dossiers'), service = new DossierService({ root: stateRoot });
  const actor = { kind: 'agent', id: 'fixture' }, provenance = [{ kind: 'execution-observed', source: { type: 'fixture' } }];
  const opened = service.open({ workspace, selection: { kind: 'committed', base, head }, actor, title: 'A review that stays on track' });
  const sources = tourSources(workspace, opened.changeRevision);
  function anchor(n, file, role, label, startLine, endLine, view = 'head', claimRefs = []) {
    const a = { n, path: file, role, label, context: { startLine, endLine }, rev: sources.revisions, side: view === 'base' ? 'base' : 'head', view, claimRefs };
    const text = sources.readSource(a); a.change = text.base === null ? 'added' : text.head === null ? 'deleted' : text.base === text.head ? 'unchanged' : 'modified'; a.contentHash = hashText(rangeText(text[a.side], a.context));
    if (file === 'service.js' && startLine === 1) a.focus = [{ side: 'head', range: {startLine:5,endLine:7} }, { side:'base', range:{startLine:6,endLine:6}, kind:'removed' }];
    return a;
  }
  service.apply({ workspace, dossierId: opened.dossierId, expectedRevision: 1, actor, commands: [
    { type: 'SetThesis', thesis: { summary: 'Reject invalid tours before changing the editor.', provenance } },
    { type: 'AddClaim', entity: { id: 'claim_guard', statement: 'Rejected candidates leave the current review intact.', truthStatus: 'observed', provenance } },
    { type: 'CreateTourPlan', presentationVersion: 2, title: 'A review that stays on track', stops: [
      { id: 'validation', title: 'Validate before opening editors', risk: 'medium', type: 'implementation', coveredEntityIds: ['claim_guard'], anchors: [anchor(1, 'service.js', 'change', 'Keep the active review', 1, 11, 'diff'), anchor(2, 'service.test.js', 'evidence', 'Prove rejected loads are safe', 3, 12, 'head', ['claim_guard']), anchor(3, 'navigation.js', 'caller', 'Advance the review', 1, 11), anchor(4, 'service.js', 'callee', 'Normalize the valid candidate', 13, 19, 'diff')], beats: [
        { id: 'guard', narration: '**Keep the current review intact.**\n\n{{a:1}} checks the incoming tour before it can replace what the reviewer sees.\n\nThe regression in {{a:2}} proves a failed load leaves the active stop unchanged.', active: [1, 2] },
        { id: 'proof', narration: '**The failure path is observable.**\n\n{{a:2}} checks both the validation finding and the retained review.\n\nReturn to {{a:1}} to trace the guard.', active: [2, 1] },
        { id: 'capacity', narration: '**All three sources.** {{a:1}} rejects invalid input, {{a:2}} checks the result, and {{a:3}} advances the review.', active: [1, 2, 3] },
        { id: 'same-source', narration: '**Two ranges, one source.** {{a:4}} normalizes the candidate that {{a:1}} checked.', active: [4, 1] }
      ] },
      { id: 'navigation', title: 'Keep navigation explicit', risk: 'low', type: 'context', anchors: [anchor(1, 'navigation.js', 'change', 'Advance one beat', 1, 11), anchor(2, 'retired.js', 'context', 'The removed opening path', 1, 4, 'base')], beats: [
        { id: 'next', narration: '**One beat at a time.**\n\n{{a:1}} advances the cursor. Following reveals the current source; Exploring keeps your editor in place.\n\nThe removed approach is still inspectable in {{a:2}}.', active: [1] },
        { id: 'removed', narration: '**Inspect the removed path.**\n\n{{a:2}} comes from the base revision, even though the file no longer exists at the head.', active: [2] }
      ] }
    ] }, { type: 'MarkPrepared' }
  ] });
  const result = { root, workspace, stateRoot, dossierId: opened.dossierId, base, head };
  fs.writeFileSync(path.join(root, 'fixture.json'), JSON.stringify(result)); return result;
}
module.exports = { createFixture };
