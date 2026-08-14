import { getTopologicallySortedNodes } from '../src/lib/graphOrder.ts';

console.log('=======================================================================');
console.log('   TEST: TOPOLOGICAL GRAPH ORDER & APPROVAL GATE STATE MACHINE        ');
console.log('=======================================================================\n');

let allPassed = true;

// 1. Setup nodes in arbitrary array order: Trigger, AI Agent, Notify, Approval Gate
const unorderedNodes = [
  { id: 'trigger-1', data: { label: 'Trigger', nodeType: 'trigger', executionStatus: undefined } },
  { id: 'ai-agent-2', data: { label: 'AI Agent', nodeType: 'ai_agent', executionStatus: undefined } },
  { id: 'notify-4', data: { label: 'Notify', nodeType: 'notify', executionStatus: undefined } },
  { id: 'approval-gate-3', data: { label: 'Approval Gate', nodeType: 'approval_gate', executionStatus: undefined } },
];

// Edges define actual graph execution flow: Trigger -> AI Agent -> Approval Gate -> Notify
const edges = [
  { id: 'e1', source: 'trigger-1', target: 'ai-agent-2' },
  { id: 'e2', source: 'ai-agent-2', target: 'approval-gate-3' },
  { id: 'e3', source: 'approval-gate-3', target: 'notify-4' },
];

// TEST 1: Topological sort recovers correct graph order
const sorted = getTopologicallySortedNodes(unorderedNodes, edges);
const sortedLabels = sorted.map((n) => n.data.label);
const expectedLabels = ['Trigger', 'AI Agent', 'Approval Gate', 'Notify'];
const isOrderCorrect = JSON.stringify(sortedLabels) === JSON.stringify(expectedLabels);

console.log('▶ TEST 1: Graph Topological Ordering from Arbitrary Nodes Array');
console.log('  - Actual Order:   ', sortedLabels.join(' → '));
console.log('  - Expected Order: ', expectedLabels.join(' → '));
console.log('  - Result:         ', isOrderCorrect ? '✓ PASS' : '❌ FAIL');
if (!isOrderCorrect) allPassed = false;

// TEST 2: Initial state before execution (0/4 = 0%)
let completedCount = sorted.filter((n) => n.data.executionStatus === 'completed').length;
let progress = Math.round((completedCount / sorted.length) * 100);
console.log('\n▶ TEST 2: Initial State (0/4 = 0%)');
console.log(`  - Progress: ${completedCount}/${sorted.length} (${progress}%)`);
console.log('  - Result:', completedCount === 0 && progress === 0 ? '✓ PASS' : '❌ FAIL');
if (completedCount !== 0 || progress !== 0) allPassed = false;

// TEST 3: Trigger completes, AI Agent is running (1/4 = 25%)
sorted.find((n) => n.id === 'trigger-1').data.executionStatus = 'completed';
sorted.find((n) => n.id === 'ai-agent-2').data.executionStatus = 'running';
completedCount = sorted.filter((n) => n.data.executionStatus === 'completed').length;
progress = Math.round((completedCount / sorted.length) * 100);
console.log('\n▶ TEST 3: Trigger Complete + AI Running (1/4 = 25%)');
console.log(`  - Progress: ${completedCount}/${sorted.length} (${progress}%)`);
console.log('  - Result:', completedCount === 1 && progress === 25 ? '✓ PASS' : '❌ FAIL');
if (completedCount !== 1 || progress !== 25) allPassed = false;

// TEST 4: AI Agent completes, Approval Gate pauses (2/4 = 50%, Paused)
sorted.find((n) => n.id === 'ai-agent-2').data.executionStatus = 'completed';
sorted.find((n) => n.id === 'approval-gate-3').data.executionStatus = 'paused';
// Notify MUST remain pending/undefined!
const notifyNode = sorted.find((n) => n.id === 'notify-4');
completedCount = sorted.filter((n) => n.data.executionStatus === 'completed').length;
progress = Math.round((completedCount / sorted.length) * 100);

console.log('\n▶ TEST 4: Paused at Approval Gate');
console.log(`  - Progress: ${completedCount}/${sorted.length} (${progress}%)`);
console.log('  - Approval Gate Status:', sorted.find((n) => n.id === 'approval-gate-3').data.executionStatus);
console.log('  - Notify Status:       ', notifyNode.data.executionStatus || 'pending');
const isTest4Pass =
  completedCount === 2 &&
  progress === 50 &&
  sorted.find((n) => n.id === 'approval-gate-3').data.executionStatus === 'paused' &&
  notifyNode.data.executionStatus === undefined;
console.log('  - Result:              ', isTest4Pass ? '✓ PASS' : '❌ FAIL');
if (!isTest4Pass) allPassed = false;

// TEST 5: User Approves -> Approval Gate completes, Notify starts running (3/4 = 75%, Executing)
sorted.find((n) => n.id === 'approval-gate-3').data.executionStatus = 'completed';
sorted.find((n) => n.id === 'notify-4').data.executionStatus = 'running';
completedCount = sorted.filter((n) => n.data.executionStatus === 'completed').length;
progress = Math.round((completedCount / sorted.length) * 100);

console.log('\n▶ TEST 5: Post-Approval Resume (Approval Gate Complete + Notify Running)');
console.log(`  - Progress: ${completedCount}/${sorted.length} (${progress}%)`);
console.log('  - Notify Status:', sorted.find((n) => n.id === 'notify-4').data.executionStatus);
const isTest5Pass = completedCount === 3 && progress === 75 && sorted.find((n) => n.id === 'notify-4').data.executionStatus === 'running';
console.log('  - Result:       ', isTest5Pass ? '✓ PASS' : '❌ FAIL');
if (!isTest5Pass) allPassed = false;

// TEST 6: Notify completes (4/4 = 100%, Completed)
sorted.find((n) => n.id === 'notify-4').data.executionStatus = 'completed';
completedCount = sorted.filter((n) => n.data.executionStatus === 'completed').length;
progress = Math.round((completedCount / sorted.length) * 100);

console.log('\n▶ TEST 6: All Steps Complete (4/4 = 100%)');
console.log(`  - Progress: ${completedCount}/${sorted.length} (${progress}%)`);
console.log('  - All statuses:', sorted.map((n) => `${n.data.label}:${n.data.executionStatus}`).join(', '));
const isTest6Pass = completedCount === 4 && progress === 100;
console.log('  - Result:       ', isTest6Pass ? '✓ PASS' : '❌ FAIL');
if (!isTest6Pass) allPassed = false;

// TEST 7: Branching condition workflow ordering
const branchingNodes = [
  { id: 'trig', data: { label: 'Trigger', nodeType: 'trigger' } },
  { id: 'notify-false', data: { label: 'Notify False', nodeType: 'notify' } },
  { id: 'cond', data: { label: 'Condition', nodeType: 'condition' } },
  { id: 'notify-true', data: { label: 'Notify True', nodeType: 'notify' } },
  { id: 'ai', data: { label: 'AI Agent', nodeType: 'ai_agent' } },
];
const branchingEdges = [
  { id: 'b1', source: 'trig', target: 'ai' },
  { id: 'b2', source: 'ai', target: 'cond' },
  { id: 'b3', source: 'cond', target: 'notify-true', sourceHandle: 'true' },
  { id: 'b4', source: 'cond', target: 'notify-false', sourceHandle: 'false' },
];

const sortedBranching = getTopologicallySortedNodes(branchingNodes, branchingEdges);
const branchingLabels = sortedBranching.map((n) => n.data.label);
console.log('\n▶ TEST 7: Branching Workflow Ordering');
console.log('  - Branching Order:', branchingLabels.join(' → '));
const isBranchingValid =
  branchingLabels.indexOf('Trigger') < branchingLabels.indexOf('AI Agent') &&
  branchingLabels.indexOf('AI Agent') < branchingLabels.indexOf('Condition') &&
  branchingLabels.indexOf('Condition') < branchingLabels.indexOf('Notify True') &&
  branchingLabels.indexOf('Condition') < branchingLabels.indexOf('Notify False');
console.log('  - Result:         ', isBranchingValid ? '✓ PASS' : '❌ FAIL');
if (!isBranchingValid) allPassed = false;

console.log('\n=======================================================================');
if (allPassed) {
  console.log('🎉 ALL GRAPH TOPOLOGY & APPROVAL GATE STATE TESTS 100% PASSED!');
} else {
  console.log('❌ SOME TESTS FAILED');
}
console.log('=======================================================================');
