/**
 * VibeRacing Stint Manager & Pit Stop Minigame Integration Test Suite
 * Validates stint transitions, stationary locking physics, sequential tire changes,
 * simultaneous 300ms refueling tap synchronization, wear resets, role swaps, and callbacks.
 */

import { TrackGenerator } from '../shared/TrackGenerator.js';
import { createInitialGameState } from '../shared/GameState.js';
import { InputHandler } from '../driver/InputHandler.js';
import { HypercarRender } from '../driver/HypercarRender.js';
import { StintManager } from '../core/StintManager.js';
import { calculateEndStintCredits } from '../shared/Progression.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

console.log('🏎️  VIBERACING STINT MANAGER & PIT STOP SIMULATION TEST 🏎️\n');

// 1. Instantiation check
console.log('Step 1: Instantiating classes and state structures...');
const track = new TrackGenerator(42, 1000);
const state = createInitialGameState();
const inputHandler = new InputHandler();
const render = new HypercarRender(null, track, state, inputHandler);
const stintManager = new StintManager('driver');

let roleSwappedCallbackCalled = false;
let callbackRole: 'driver' | 'engineer' | null = null;
stintManager.onRoleSwapped = (newRole) => {
  roleSwappedCallbackCalled = true;
  callbackRole = newRole;
};

// Verify initial state is clean
assert(state.pitStop === undefined, 'Initial state should not have active pitStop');
assert(stintManager.role === 'driver', 'Initial role should be driver');

// Set some component wear and failures to check if they reset/clear during pit stop
state.wear.tires.frontLeft = 0.8;
state.wear.tires.frontRight = 0.7;
state.wear.tires.rearLeft = 0.6;
state.wear.tires.rearRight = 0.5;
state.wear.brakes.frontLeft = 0.9;
state.wear.brakes.frontRight = 0.8;
state.wear.engine.wear = 0.75;
state.wear.engine.temperature = 110.0;
state.environment.sensorFailures.tires = true;
state.environment.sensorFailures.brakes = true;

// 2. Driving loop / snap to pit stop node 980
console.log('\nStep 2: Snapping vehicle position to node 980 (index range [975, 985]) and speed <= 3.0 m/s...');
const node980 = track.nodes[980];
state.kinematics.position.x = node980.position.x;
state.kinematics.position.y = node980.position.y;
state.kinematics.position.z = node980.position.z;
render.carPos = { x: node980.position.x, z: node980.position.z };

// A. Check that stintManager doesn't trigger pit stop if speed is > 3.0 m/s
render.velocity = 15.0; // 15 m/s
state.kinematics.velocity = { x: 15.0, y: 0.0, z: 0.0 };
stintManager.update(state, track);
assert(state.pitStop === undefined || !state.pitStop.active, 'Pit stop must not trigger if speed is high');

// B. Check that stintManager triggers pit stop if speed is <= 3.0 m/s
render.velocity = 2.0; // 2 m/s
state.kinematics.velocity = { x: 2.0, y: 0.0, z: 0.0 };
stintManager.update(state, track);

assert(state.pitStop !== undefined && state.pitStop.active, 'Pit stop should automatically trigger');
assert(state.pitStop!.stage === 'TIRES', 'Pit stop stage should start with TIRES');
assert(state.pitStop!.tireStep === 0, 'Pit stop tireStep should start at 0');
assert(!state.environment.sensorFailures.tires, 'Sensor failures must clear during pit stop diagnostics');
assert(!state.environment.sensorFailures.brakes, 'Sensor failures must clear during pit stop diagnostics');
console.log('✅ Automatically entered pit stop sequence and cleared sensor failures.');

// 3. Primary Controls Lock Verification
console.log('\nStep 3: Verifying that primary controls are disabled and locked...');
// Press keyboard keys throttle 'w' and steer right 'd'
const activeKeys = inputHandler['activeKeys'];
activeKeys.add('w');
activeKeys.add('d');

// Run a physics render update tick
render.update(0.016);
assert(inputHandler.isLocked, 'inputHandler must be locked');
assert(state.telemetry.throttle === 0.0, 'Throttle must be forced to 0.0');
assert(state.telemetry.brake === 1.0, 'Brake must be forced to 1.0');
assert(render.velocity === 0.0, 'Velocity must be forced to 0.0 (locked stationary)');
console.log('✅ Controls disabled and vehicle locked stationary successfully.');

// 4. Stage 1: Tire Changing Minigame
console.log('\nStep 4: Simulating Stage 1 ("TIRES") alternating role keystrokes...');
const initialKey = state.pitStop!.targetKey!;
assert(initialKey !== undefined, 'Target key must be generated on entering the pit stop');
const driverPool = ['W', 'A', 'S', 'D', 'Q', 'E', 'R', 'F', 'Z', 'X', 'C'];
const wrongKey = driverPool.find(k => k.toLowerCase() !== initialKey.toLowerCase())!;

// Try wrong role
stintManager.handleKeyPress(state, 'engineer', initialKey, 1000); // wrong role
assert(state.pitStop!.tireStep === 0, 'Tire step must not advance with wrong role');
assert(state.pitStop!.targetKey === initialKey, 'Target key must not regenerate on wrong role press');

// Try wrong key (correct role, wrong key)
stintManager.handleKeyPress(state, 'driver', wrongKey, 1000);
assert(state.pitStop!.tireStep === 0, 'Tire step must not advance with wrong key');
const regeneratedKey = state.pitStop!.targetKey!;
assert(regeneratedKey !== initialKey, 'Target key must regenerate to a different key on mis-press penalty');
console.log(`✅ Mis-press penalty successfully regenerated target key from ${initialKey} to ${regeneratedKey}`);

// Correct keystroke 0: Driver correctKeyStep0
const correctKeyStep0 = state.pitStop!.targetKey!;
stintManager.handleKeyPress(state, 'driver', correctKeyStep0, 1000);
assert(state.pitStop!.tireStep === 1, 'Tire step must advance to 1 after driver correct key');

// Correct keystroke 1: Engineer correctKeyStep1
const correctKeyStep1 = state.pitStop!.targetKey!;
stintManager.handleKeyPress(state, 'engineer', correctKeyStep1, 1050);
assert(state.pitStop!.tireStep === 2, 'Tire step must advance to 2 after engineer correct key');

// Correct keystroke 2: Driver correctKeyStep2
const correctKeyStep2 = state.pitStop!.targetKey!;
stintManager.handleKeyPress(state, 'driver', correctKeyStep2, 1100);
assert(state.pitStop!.tireStep === 3, 'Tire step must advance to 3 after driver correct key');

// Correct keystroke 3: Engineer correctKeyStep3
const correctKeyStep3 = state.pitStop!.targetKey!;
stintManager.handleKeyPress(state, 'engineer', correctKeyStep3, 1150);
assert(state.pitStop!.stage === 'REFUEL', 'Stage must advance to REFUEL');
assert(state.pitStop!.tireStep === 4, 'Tire step must be completed');
console.log('✅ Sequential tire changing minigame correctly advances steps.');

// 5. Stage 2: Refueling Minigame (Simultaneous spacebar taps within 300ms)
console.log('\nStep 5: Simulating Stage 2 ("REFUEL") synchronized/unsynchronized space taps...');
assert(state.pitStop!.fuelSyncTaps === 0, 'Taps should start at 0');

// A. Unsynchronized taps: Driver taps at T=1000, Engineer taps at T=1400 (diff = 400ms > 300ms)
stintManager.handleKeyPress(state, 'driver', ' ', 1000);
stintManager.handleKeyPress(state, 'engineer', ' ', 1400);
assert(state.pitStop!.fuelSyncTaps === 0, 'Should not sync when tap difference is > 300ms');

// B. Synchronized Tap 1: Driver taps at T=2000, Engineer taps at T=2150 (diff = 150ms <= 300ms)
stintManager.handleKeyPress(state, 'driver', ' ', 2000);
stintManager.handleKeyPress(state, 'engineer', ' ', 2150);
assert(state.pitStop!.fuelSyncTaps === 1, 'Should sync when tap difference is <= 300ms');

// C. Synchronized Tap 2: Engineer taps first at T=3000, Driver taps at T=3200 (diff = 200ms)
stintManager.handleKeyPress(state, 'engineer', ' ', 3000);
stintManager.handleKeyPress(state, 'driver', ' ', 3200);
assert(state.pitStop!.fuelSyncTaps === 2, 'Should sync when engineer taps first');

// D. Perform 3 more synchronized taps to reach 5
stintManager.handleKeyPress(state, 'driver', ' ', 4000);
stintManager.handleKeyPress(state, 'engineer', ' ', 4010); // Tap 3
stintManager.handleKeyPress(state, 'driver', ' ', 5000);
stintManager.handleKeyPress(state, 'engineer', ' ', 5050); // Tap 4
stintManager.handleKeyPress(state, 'engineer', ' ', 6000);
stintManager.handleKeyPress(state, 'driver', ' ', 6020);   // Tap 5

// On the 5th synchronized tap, the pit stop should be COMPLETE!
console.log('✅ Coordinated spacebar tapping logic successfully verified.');

// 6. Completion, Wear Resets, Role Swap and Credits verification
console.log('\nStep 6: Verifying completion actions (resets, credits, WebRTC role reversal)...');
assert(!state.pitStop!.active, 'Pit stop must be deactivated');
assert(state.pitStop!.stage === 'COMPLETE', 'Pit stop stage must be COMPLETE');

// Check wear reset
assert(state.wear.tires.frontLeft === 0.0, 'Tires wear must reset to 0');
assert(state.wear.tires.frontRight === 0.0, 'Tires wear must reset to 0');
assert(state.wear.tires.rearLeft === 0.0, 'Tires wear must reset to 0');
assert(state.wear.tires.rearRight === 0.0, 'Tires wear must reset to 0');
assert(state.wear.brakes.frontLeft === 0.0, 'Brakes wear must reset to 0');
assert(state.wear.brakes.frontRight === 0.0, 'Brakes wear must reset to 0');
assert(state.wear.engine.wear === 0.0, 'Engine wear must reset to 0');
assert(state.wear.engine.temperature === 80.0, 'Engine temp must reset to 80.0C');
console.log('✅ Component wear and engine temperature fully reset.');

// Check credits awarded
const expectedCredits = calculateEndStintCredits(
  stintManager.syncAccuracy,
  state.metrics.deltaConsistency,
  stintManager.ersConsumed,
  stintManager.ersTarget,
  state.metrics.syncStreak
);
assert(state.metrics.dataCredits === expectedCredits, `Credits added (${state.metrics.dataCredits}) must match expected (${expectedCredits})`);
console.log(`✅ Progression Credits successfully calculated and awarded: ${state.metrics.dataCredits} credits.`);

// Check WebRTC role swap and callback
assert(stintManager.role === 'engineer', 'Role must invert to engineer');
assert(roleSwappedCallbackCalled, 'onRoleSwapped callback must be triggered');
assert(callbackRole === 'engineer', 'onRoleSwapped callback must pass the correct role');
console.log('✅ WebRTC roles swapped and callback fired properly.');

console.log('\n🚀 ALL STINT TRANSITION & PIT STOP MINIGAME INTEGRATION TESTS PASSED!');
process.exit(0);
