"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const {createLayoutState, compatible, stopIdentity}=require("./compiled.js")("src/host/layout-state.js");
const state={workspace:'/workspace',tourId:'tour',identity:'sha256:one'},stop={anchors:[{n:1,path:'a.js'}],beats:[]};
const saved=()=>({identity:stopIdentity(state,stop),layout:{orientation:1,groups:[{}]},slots:[{anchor:1,pinned:true,lastActive:1}],customized:true,sequence:false,override:false});
test('profile state is isolated by workspace and tour, while revision changes retain only role choices',async()=>{
  const data=new Map(),store=createLayoutState({get:k=>data.get(k),update:async(k,v)=>data.set(k,v)});
  await store.write(state,{layouts:{one:saved()},preferences:{evidence:{kind:'replace',slot:'bottom'},invalid:{kind:'peek'},change:{kind:'command',slot:'top'}}});
  assert.deepEqual(store.read(state).preferences,{evidence:{kind:'replace',slot:'bottom'}});
  assert.deepEqual(store.read({...state,identity:'changed'}).layouts,{});
  assert.deepEqual(store.read({...state,tourId:'another'}),{preferences:{},layouts:{}});
  assert.deepEqual(store.read({...state,workspace:'/other'}),{preferences:{},layouts:{}});
});
test('untrusted state cannot restore unknown anchors, duplicate anchors, invalid geometry, or wrong source identity',()=>{
  assert.equal(compatible(saved(),state,stop,3),true);
  for(const mutate of [s=>s.identity='old',s=>s.slots[0].anchor=99,s=>s.layout.groups[0].size=-1,s=>s.layout.orientation=8,s=>s.slots[0].pinned='yes',s=>{s.layout.groups.push({});s.slots.push(s.slots[0]);}]) {
    const value=saved();mutate(value);assert.equal(compatible(value,state,stop,3),false);
  }
  assert.equal(compatible(null,state,stop,3),false);
});
