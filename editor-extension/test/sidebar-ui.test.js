'use strict';
const { dom, observers } = require('./ui/environment.js');
const { test, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { render, screen, within, act, cleanup, fireEvent } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
const { App } = require('./compiled.js')('src/webview/App.js');
const { createBridge } = require('./compiled.js')('src/webview/bridge.js');
const { snapshot } = require('./ui/snapshot.js');
afterEach(cleanup);
after(() => dom.window.close());
function setup(s = snapshot()) {
  const messages = [];
  const bridge = createBridge({ postMessage: m => messages.push(m) }, window);
  const rendered = render(React.createElement(App, { bridge }));
  const receive = data => act(() => window.dispatchEvent(new window.MessageEvent('message', { data })));
  const update = next => receive({ type:'snapshot', snapshot:next });
  if (s) update(s);
  return { ...rendered, messages, bridge, receive, update, user: userEvent.setup({document}) };
}
const button = name => screen.getByRole('button', { name, exact:true });
const region = () => screen.getByRole('region', {name:'Stop anchor list. Use arrow keys to navigate rows.'});

test('ready handshake, ordered messages and actions use the latest accepted revision', async () => {
  const f = setup(null);
  assert.deepEqual(f.messages, [{type:'ready'}]);
  act(() => {
    window.dispatchEvent(new window.MessageEvent('message',{data:{type:'snapshot',snapshot:snapshot(7,{revision:9})}}));
    window.dispatchEvent(new window.MessageEvent('message',{data:{type:'selectAnchor',anchor:3}}));
  });
  assert.ok(screen.getByRole('region',{name:'Placement picker'}));
  f.update(snapshot(7,{revision:8,title:'Stale title'}));
  assert.equal(screen.queryByText('Stale title'),null);
  await f.user.click(button('Next beat →'));
  assert.deepEqual(f.messages.at(-1),{type:'navigate',action:'nextBeat',revision:9});
  f.receive({type:'error',message:'Try the latest snapshot'});
  assert.equal(screen.getByRole('alert').textContent,'Try the latest snapshot');
  f.update(snapshot(7,{revision:10}));
  assert.equal(screen.getByRole('alert').textContent,'');
  await f.user.click(button('Exploring'));
  assert.deepEqual(f.messages.at(-1),{type:'state',mode:'exploring',revision:10});
});

test('filter and grouping survive snapshots and reset when the stop changes', async () => {
  const f = setup(snapshot(24));
  await f.user.type(screen.getByRole('searchbox'),'file-24');
  assert.ok(button('Anchor 24: src/file-24.ts'));
  f.update(snapshot(24,{revision:2}));
  assert.equal(screen.getByRole('searchbox').value,'file-24');
  await f.user.click(button('Order'));
  const next=snapshot(24,{revision:3}); next.stop.id='next'; f.update(next);
  assert.equal(screen.getByRole('searchbox').value,'');
  assert.equal(button('Order').getAttribute('aria-pressed'),'true');
  await f.user.click(button('Role'));
  const section=button('Callers, 4 anchors'); assert.equal(section.getAttribute('aria-expanded'),'false');
  await f.user.click(section); assert.equal(section.getAttribute('aria-expanded'),'true');
});

test('picker preserves focus and remembered choice across a snapshot, then Escape returns to its row', async () => {
  const f=setup(); await f.user.click(button('Open anchor 3: file-3.ts'));
  assert.equal(document.activeElement,button('Replace 1 in top'));
  await f.user.click(screen.getByRole('checkbox',{name:'Remember for caller anchors'}));
  const tile=button('Below 1 in top'); tile.focus();
  f.update(snapshot(7,{revision:2}));
  assert.equal(document.activeElement,tile);
  assert.equal(screen.getByRole('checkbox').checked,true);
  await f.user.click(tile);
  assert.deepEqual(f.messages.at(-1),{type:'layout',action:'place',anchor:3,placement:{kind:'below',of:1},remember:true,revision:2});
  await f.user.keyboard('{Escape}');
  assert.equal(screen.queryByRole('region',{name:'Placement picker'}),null);
  assert.equal(document.activeElement,button('Anchor 3: src/file-3.ts'));
});

test('row controls retain their DOM identity and focus after updates', () => {
  const f=setup(); const pin=button('Pin anchor 1'); pin.focus();
  const next=snapshot(7,{revision:2});next.presentation.layout.slots[0].pinned=true;f.update(next);
  assert.equal(button('Unpin anchor 1'),pin); assert.equal(document.activeElement,pin);
});

test('paused state disables rows, picker, narration and reset actions', async () => {
  const f=setup();await f.user.click(button('Open anchor 3: file-3.ts'));
  f.update(snapshot(7,{revision:2,mode:'paused'}));
  for(const name of ['Anchor 1: src/file-1.ts','Replace 1 in top','Inspect source one','Reset layout']) assert.equal(button(name).disabled,true,name);
  const length=f.messages.length;
  await f.user.click(button('Replace 1 in top'));
  f.receive({type:'selectAnchor',anchor:2});
  assert.equal(f.messages.length,length);
  assert.match(screen.getByRole('region',{name:'Placement picker'}).textContent,/Open 3/);
});

test('remembered placements send directly and explicit moves still open the picker', async () => {
  const s=snapshot(); s.presentation.layout.preferences.caller={slot:'top'};
  const f=setup(s); await f.user.click(button('Open anchor 3: file-3.ts'));
  assert.deepEqual(f.messages.at(-1),{type:'layout',action:'place',anchor:3,placement:{kind:'replace',of:1},revision:1});
  assert.equal(screen.queryByRole('region',{name:'Placement picker'}),null);
  f.receive({type:'selectAnchor',anchor:3,move:true});
  assert.ok(screen.getByRole('region',{name:'Placement picker'}));
});

test('windowed keyboard navigation reaches anchor 99 and retains a search filter', async () => {
  const f=setup(snapshot(99));await f.user.click(button('Order'));
  assert.ok(document.querySelectorAll('[data-row]').length<20);
  region().focus(); await f.user.keyboard('{End}');
  assert.equal(document.activeElement,button('Anchor 99: src/file-99.ts'));
  assert.ok(region().scrollTop>5000);
  await f.user.type(screen.getByRole('searchbox'),'file-9');
  const matches=within(region()).getAllByRole('button').filter(b=>b.dataset.anchor);
  matches[0].focus(); await f.user.keyboard('{End}');
  assert.equal(document.activeElement,button('Anchor 99: src/file-99.ts'));
  assert.equal(screen.getByRole('searchbox').value,'file-9');
  await f.user.keyboard('{Home}');assert.equal(document.activeElement,button('Anchor 9: src/file-9.ts'));
});

test('numeric shortcuts open two-digit anchors and Alt+0 requests native search', () => {
  const f=setup(snapshot(24));
  fireEvent.keyDown(document,{key:'@',code:'Digit2',altKey:true,shiftKey:true});
  assert.match(screen.getByRole('region',{name:'Placement picker'}).textContent,/Open 12/);
  fireEvent.keyDown(document,{key:'0',code:'Digit0',altKey:true});
  assert.deepEqual(f.messages.at(-1),{type:'quickPick',revision:1});
});

test('narration stays escaped, exposes live text, and dispatches only numbered chips', async () => {
  const f=setup();const narration=document.getElementById('narration');
  assert.equal(narration.getAttribute('aria-live'),'polite');
  assert.equal(narration.querySelector('img'),null);
  assert.ok(narration.textContent.includes('<img src=x onerror=alert(1)>'));
  await f.user.click(button('Inspect source one'));
  assert.deepEqual(f.messages.at(-1),{type:'focus',anchor:1,revision:1});
  const chip=button('Inspect source one');chip.focus();f.update(snapshot(7,{revision:2}));
  assert.equal(document.activeElement,chip);
  assert.ok(narration.compareDocumentPosition(document.getElementById('inventory')) & Node.DOCUMENT_POSITION_PRECEDING);
});

test('pin, reset, sequence override, stop navigation and end send typed requests', async () => {
  const s=snapshot();s.presentation.layout.sequence=true;const f=setup(s);
  for(const [name,expected] of [['Pin anchor 1',{type:'layout',action:'pin',anchor:1,pinned:true}],['Reset layout',{type:'layout',action:'reset'}],['Show multiple groups',{type:'sequenceOverride'}],['Next stop',{type:'navigate',action:'nextStop'}],['End tour',{type:'clear'}]]) {
    await f.user.click(button(name));assert.deepEqual(f.messages.at(-1),{...expected,revision:1});
  }
  f.update({loaded:false,revision:2});assert.ok(screen.getByText('Load a tour from your agent to begin.'));
});

test('all required inventory counts retain accessible role labels and bounded rows', async () => {
  for(const count of [1,3,7,12,24,99]) {
    const f=setup(snapshot(count));
    assert.ok(screen.getByText(`${count} ${count===1?'anchor':'anchors'} · 1 in view`));
    if(count===1)assert.ok(screen.getByText('src/file-1.ts:1–10 · change'));
    else assert.ok(button('Change: focus anchor 1').dataset.tooltip==='Change');
    if(count>=5) {
      await f.user.type(screen.getByRole('searchbox'),`file-${count}.ts`);
      assert.ok(button(`Anchor ${count}: src/file-${count}.ts`));
    }
    f.unmount();
  }
});

test('unmount removes message and keyboard listeners and disconnects observers', () => {
  const f=setup();assert.ok(observers.size>0);const state=f.bridge.getState();
  f.unmount();assert.equal(observers.size,0);
  f.receive({type:'snapshot',snapshot:snapshot(7,{revision:8})});
  fireEvent.keyDown(document,{key:'0',code:'Digit0',altKey:true});
  assert.equal(f.bridge.getState(),state);assert.deepEqual(f.messages,[{type:'ready'}]);
});
