import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scoreBattle,chooseProposal,validAllocation} from '../rules.mjs';
test('PDF worked example scores A0 B100 C900 D500',()=>{assert.deepEqual(scoreBattle([[30,30,20,10,10],[20,20,20,20,20],[40,40,20,0,0],[10,10,30,50,0]],[500,400,300,200,100]).scores,[0,100,900,500]);});
test('battlefield ties divide points equally',()=>{assert.deepEqual(scoreBattle([[30],[30],[0]],[300]).scores,[150,150,0]);});
test('no-score tie mode',()=>{assert.deepEqual(scoreBattle([[30],[30]],[300],'none').scores,[0,0]);});
test('highest approvals wins and fallback when threshold missed',()=>{assert.equal(chooseProposal([3,4,1,1],4),1);assert.equal(chooseProposal([2,2,1,0],4),-1);assert.equal(chooseProposal([3,2,1],3),0);});
test('integer allocation validation',()=>{assert.equal(validAllocation([100,100,100,100],400,true),true); for(const a of [[100.5,99.5,100,100],[-1,201,100,100],[99,100,100,100]])assert.equal(validAllocation(a,400,true),false);assert.equal(validAllocation([10,20],100),true);});
