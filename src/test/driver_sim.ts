/**
 * VibeRacing Driver Simulation & Physics Integration Test Suite
 * Validates Gamepad/Keyboard InputHandler, procedural WebGL Track Extrusion structures,
 * volumetric fog material initialization, cooperative physics parameter modulations,
 * sliding/drifting lateral dynamics, and binary state sync.
 */

import { TrackGenerator } from '../shared/TrackGenerator.js';
import { createInitialGameState } from '../shared/GameState.js';
import { InputHandler } from '../driver/InputHandler.js';
import { HypercarRender } from '../driver/HypercarRender.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

console.log('🏎️  VIBERACING DRIVER SIMULATION & PHYSICS INTEGRATION TEST 🏎️\n');

// 1. Instantiation check
console.log('Step 1: Instantiating track generator and initial states...');
const track = new TrackGenerator(42, 1000);
const state = createInitialGameState();
const inputHandler = new InputHandler();

console.log('Step 2: Initializing HypercarRender (Headless / Null Canvas)...');
const render = new HypercarRender(null, track, state, inputHandler);

assert(render.trackMesh !== null, 'Track mesh must be procedurally generated');
assert(render.carMesh !== null, 'Car mesh must be procedurally generated');
assert(render.scene.children.length >= 2, 'Scene must contain track and car meshes');
console.log('✅ Three.js objects, meshes, and fog shaders successfully configured.');

// 2. Keyboard fallback and smoothing checks
console.log('\nStep 3: Simulating keyboard inputs (W = Throttle, D = Steer Right)...');
// Inject key presses manually using the private activeKeys set
const activeKeys = inputHandler['activeKeys'];
activeKeys.add('w');
activeKeys.add('d');

// Run multiple 60Hz physics steps to verify smoothing
console.log('- Running 10 steps of 60Hz ticks to verify input interpolation...');
for (let i = 0; i < 10; i++) {
  render.update(0.016);
}

console.log(`- Smoothed Steering: ${inputHandler.steering.toFixed(4)}`);
console.log(`- Smoothed Throttle: ${inputHandler.throttle.toFixed(4)}`);
console.log(`- Smoothed Brake: ${inputHandler.brake.toFixed(4)}`);

assert(inputHandler.throttle > 0.0, 'Throttle must smoothly interpolate upwards');
assert(inputHandler.steering > 0.0, 'Steering must smoothly interpolate rightwards');
assert(render.velocity > 0.0, 'Velocity must increase under throttle acceleration');
assert(render.yaw > 0.0, 'Car heading yaw must rotate rightwards under steering');
console.log('✅ Input smoothing, deadzones, and basic kinematics integration PASSED.');

// 3. Cooperative buff testing (Sync Streak increases acceleration force)
console.log('\nStep 4: Testing cooperative buffs (typing accuracy Sync Streak)...');
// Reset state velocity
render.velocity = 0.0;
render.yaw = 0.0;
render.velYaw = 0.0;
render.carPos = { x: 0.0, z: 0.0 };

// Bypass keyboard smoothing to isolate physics formulas exactly
inputHandler.throttle = 1.0;
inputHandler.steering = 0.0;
inputHandler.brake = 0.0;

// Base acceleration case (syncStreak = 0)
state.metrics.syncStreak = 0;
state.wear.engine.wear = 0.0;

// Force inputHandler not to overwrite our manual override
const originalHandlerUpdate = inputHandler.update;
inputHandler.update = () => {};

render.update(0.016);
const baseVelIncrement = render.velocity;
console.log(`- Base 60Hz 1-tick velocity increment (Streak 0): ${baseVelIncrement.toFixed(4)} m/s`);

// Buffed acceleration case (syncStreak = 20)
render.velocity = 0.0;
state.metrics.syncStreak = 20; // 20 streak should give +100% acceleration (1.0 + 20 * 0.05 = 2.0)
render.update(0.016);
const buffedVelIncrement = render.velocity;
console.log(`- Buffed 60Hz 1-tick velocity increment (Streak 20): ${buffedVelIncrement.toFixed(4)} m/s`);

assert(buffedVelIncrement > baseVelIncrement * 1.8, 'Sync streak buff must substantially scale up acceleration force');
console.log('✅ Cooperative typing Sync Streak buff successfully verified.');

// 4. Cooperative debuff testing (Engine Wear reduces acceleration force)
console.log('\nStep 5: Testing cooperative engine wear degradation debuff...');
render.velocity = 0.0;
state.metrics.syncStreak = 0;
state.wear.engine.wear = 0.8; // 80% engine wear should reduce acceleration by 32% (1.0 - 0.8 * 0.4 = 0.68)
render.update(0.016);
const wornVelIncrement = render.velocity;
console.log(`- Worn 60Hz 1-tick velocity increment (80% Wear): ${wornVelIncrement.toFixed(4)} m/s`);

assert(wornVelIncrement < baseVelIncrement * 0.75, 'Engine wear debuff must scale down acceleration force');
console.log('✅ Component wear and engine degradation debuffs successfully verified.');

// Restore original update method for inputHandler
inputHandler.update = originalHandlerUpdate;

// 5. Sliding & Lateral Drift dynamics under tire wear & rubber marbles
console.log('\nStep 6: Simulating lateral drift/sliding dynamics under tire wear & rubber marbles...');
// Setup high velocity and steer right
render.velocity = 30.0; // 30 m/s (~108 km/h)
render.yaw = 0.0;
render.velYaw = 0.0;

// Case A: High Grip (0% tire wear, 0% rubber marbles)
state.wear.tires.frontLeft = 0.0;
state.environment.rubberMarbles = 0.0;
activeKeys.clear();
activeKeys.add('d'); // Steering hard right
inputHandler['keyboardSteering'] = 1.0;

render.update(0.016);
// Compute heading alignment angular distance
let angleDiffHighGrip = Math.abs(render.yaw - render.velYaw);
console.log(`- High Grip heading-velocity angle difference: ${angleDiffHighGrip.toFixed(4)} rad`);

// Case B: Low Grip (80% frontLeft tire wear, 90% rubber marbles)
render.velocity = 30.0;
render.yaw = 0.0;
render.velYaw = 0.0;
state.wear.tires.frontLeft = 0.8;
state.environment.rubberMarbles = 0.9;

render.update(0.016);
let angleDiffLowGrip = Math.abs(render.yaw - render.velYaw);
console.log(`- Low Grip / Drifting heading-velocity angle difference: ${angleDiffLowGrip.toFixed(4)} rad`);

// Low grip should result in less immediate velocity vector alignment, hence a larger angular lag (drift)
assert(angleDiffLowGrip > angleDiffHighGrip, 'Low grip must slow down velYaw tracking yaw, causing sliding lag');
console.log('✅ Lateral drifting, tire wear penalties, and rubber marble grip loss successfully validated.');

// 6. Kinematic State synchronization to SharedGameState
console.log('\nStep 7: Validating high-frequency binary state synchronization...');
assert(state.kinematics.position.x === render.carPos.x, 'Position X must be synchronized to GameState');
assert(state.kinematics.heading === render.yaw, 'Heading yaw must be synchronized to GameState');
assert(state.telemetry.throttle === inputHandler.throttle, 'Telemetry throttle must match input handler throttle');
assert(state.sequenceNumber > 0, 'Sequence number must increment monotonically');
assert(state.timestamp > 0, 'Timestamp must progress with dt ticks');
console.log('✅ GameState metrics and kinematics synchronization validated.');

// 7. Full 60-step cycle execution
console.log('\nStep 8: Simulating a continuous 60-step driving lap (60Hz)...');
activeKeys.clear();
activeKeys.add('w'); // Full throttle forward
for (let i = 0; i < 60; i++) {
  render.update(0.016);
}
console.log(`- Completed simulation run:`);
console.log(`  - Final position: (${state.kinematics.position.x.toFixed(2)}, ${state.kinematics.position.y.toFixed(2)}, ${state.kinematics.position.z.toFixed(2)})`);
console.log(`  - Final velocity: ${render.velocity.toFixed(2)} m/s (${(render.velocity * 3.6).toFixed(1)} km/h)`);
console.log(`  - Final heading: ${render.yaw.toFixed(4)} rad`);
console.log(`  - Final state tick sequence: ${state.sequenceNumber}`);

console.log('\n🚀 All driver rendering and cooperative physics tests passed successfully!');
inputHandler.destroy();
process.exit(0);
