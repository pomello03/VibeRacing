/**
 * VibeRacing Progression & Vehicle Aging Simulation Integration Test Suite
 * Validates credits formula weighting, asymmetric kinematics-based tire wear,
 * racing line offset and offline marbles accumulation, and component wear-triggered sensor telemetry failures.
 */

import { createInitialGameState, SharedGameState } from "../shared/GameState.js";
import { TrackGenerator } from "../shared/TrackGenerator.js";
import { calculateEndStintCredits, updateVehicleAging } from "../shared/Progression.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

console.log("🏎️  VIBERACING PROGRESSION & VEHICLE AGING INTEGRATION TEST 🏎️\n");

// ============================================================================
// STEP 1: Credits Calculation Weights and Output Ranges
// ============================================================================
console.log("Step 1: Validating Credits Calculation (calculateEndStintCredits)...");

// Test Case 1.1: Perfect stint (Accuracy=1.0, Consistency=1.0, ERS compliance=1.0, streak=0)
const perfectCredits = calculateEndStintCredits(1.0, 1.0, 50, 50, 0);
console.log(`- Perfect stint credits (expected: 1000): ${perfectCredits}`);
assert(perfectCredits === 1000, "Perfect stint score should result in exactly 1000 credits");

// Test Case 1.2: Perfect stint with 20 Sync Streak (expected 2.0x modifier -> 2000 credits)
const buffedCredits = calculateEndStintCredits(1.0, 1.0, 50, 50, 20);
console.log(`- Streaked perfect stint credits (expected: 2000): ${buffedCredits}`);
assert(buffedCredits === 2000, "Perfect stint with streak of 20 should result in exactly 2000 credits");

// Test Case 1.3: Partial stint (Accuracy=0.8, Consistency=0.7, consumed=45, target=50, streak=10)
// compliance = 1.0 - abs(45-50)/50 = 0.9
// score = 0.4 * 0.8 + 0.3 * 0.7 + 0.3 * 0.9 = 0.32 + 0.21 + 0.27 = 0.80
// credits = 1000 * 0.80 * (1 + 10 * 0.05) = 800 * 1.5 = 1200
const partialCredits = calculateEndStintCredits(0.8, 0.7, 45, 50, 10);
console.log(`- Partial stint credits (expected: 1200): ${partialCredits}`);
assert(Math.abs(partialCredits - 1200) < 0.001, `Partial stint credits should be 1200, got ${partialCredits}`);

// Test Case 1.4: Extreme compliance over-consumption clamping
// consumed=200, target=50. compliance would be 1 - (150/50) = -2 -> clamped to 0
const clampedCredits = calculateEndStintCredits(1.0, 1.0, 200, 50, 0);
console.log(`- Clamped stint credits (expected: 700): ${clampedCredits}`);
// score = 0.4 * 1.0 + 0.3 * 1.0 + 0.3 * 0 = 0.70 -> credits = 700
assert(Math.abs(clampedCredits - 700) < 0.001, `Clamped stint credits should be 700, got ${clampedCredits}`);

console.log("✅ Credits calculation validations completed successfully.\n");

// ============================================================================
// STEP 2: Simulating Straight Line Driving vs Heavy Turning Right (Asymmetric Tire Wear)
// ============================================================================
console.log("Step 2: Simulating Kinematics-based Asymmetric Tire Wear...");
const track = new TrackGenerator(42, 1000);

// Initialize game state for driving straight under acceleration
const straightState = createInitialGameState();
// Place vehicle on the centerline of node 0
const node0 = track.nodes[0];
straightState.kinematics.position = { ...node0.position };

// Simulate 100 ticks of acceleration in a straight line (steering = 0.0, throttle = 1.0, brake = 0)
const dt = 0.016;
for (let i = 0; i < 100; i++) {
  updateVehicleAging(straightState, track, 0.0, 1.0, 0.0, dt);
}

console.log("- Straight-line acceleration wear profile:");
console.log(`  - Front Left  Tire Wear: ${straightState.wear.tires.frontLeft.toFixed(6)}`);
console.log(`  - Front Right Tire Wear: ${straightState.wear.tires.frontRight.toFixed(6)}`);
console.log(`  - Rear Left   Tire Wear: ${straightState.wear.tires.rearLeft.toFixed(6)}`);
console.log(`  - Rear Right  Tire Wear: ${straightState.wear.tires.rearRight.toFixed(6)}`);

// In a straight line under throttle, rear tires must wear faster than front tires
assert(straightState.wear.tires.rearLeft > straightState.wear.tires.frontLeft, "Rear tires must wear more than front tires under acceleration");
assert(straightState.wear.tires.rearRight > straightState.wear.tires.frontRight, "Rear tires must wear more than front tires under acceleration");
// Symmetrical driving should produce identical left/right wear
assert(straightState.wear.tires.frontLeft === straightState.wear.tires.frontRight, "Symmetrical steering must result in identical front tire wear");
assert(straightState.wear.tires.rearLeft === straightState.wear.tires.rearRight, "Symmetrical steering must result in identical rear tire wear");

// Initialize game state for heavy turning right
const rightTurnState = createInitialGameState();
rightTurnState.kinematics.position = { ...node0.position };

// Simulate 100 ticks of hard right steering (steering = 1.0, throttle = 0.0, brake = 0)
for (let i = 0; i < 100; i++) {
  updateVehicleAging(rightTurnState, track, 1.0, 0.0, 0.0, dt);
}

console.log("- Hard right turn wear profile:");
console.log(`  - Front Left  Tire Wear: ${rightTurnState.wear.tires.frontLeft.toFixed(6)}`);
console.log(`  - Front Right Tire Wear: ${rightTurnState.wear.tires.frontRight.toFixed(6)}`);
console.log(`  - Rear Left   Tire Wear: ${rightTurnState.wear.tires.rearLeft.toFixed(6)}`);
console.log(`  - Rear Right  Tire Wear: ${rightTurnState.wear.tires.rearRight.toFixed(6)}`);

// Turning right loads the left tires (outer), so they must wear out significantly faster than right tires (inner)
assert(rightTurnState.wear.tires.frontLeft > rightTurnState.wear.tires.frontRight, "Turning right must load and wear frontLeft tire more than frontRight");
assert(rightTurnState.wear.tires.rearLeft > rightTurnState.wear.tires.rearRight, "Turning right must load and wear rearLeft tire more than rearRight");

console.log("✅ Asymmetric component tire wear validations completed successfully.\n");

// ============================================================================
// STEP 3: Offline Marbles Accumulation and Acceleration of Wear
// ============================================================================
console.log("Step 3: Simulating Driving Wide (Rubber Marbles and Accelerated Tire Wear)...");

// Initialize game state for offline driving wide
const wideState = createInitialGameState();
const snappedNode = track.findClosestNode(0, 0);

// Offset car by more than 30% of snapped node's width to go offline into the marbles
// node width is usually 10m to 16m, so 10 meters offset is definitely wide (> 0.3 * width)
wideState.kinematics.position = {
  x: snappedNode.position.x + 10.0,
  y: snappedNode.position.y,
  z: snappedNode.position.z + 10.0,
};

// Check that driving wide increases marbles accumulation
updateVehicleAging(wideState, track, 0.0, 1.0, 0.0, dt);
console.log(`- Rubber marbles accumulation after 1 wide tick (expected > 0): ${wideState.environment.rubberMarbles}`);
assert(wideState.environment.rubberMarbles > 0.0, "Driving wide must accumulate rubber marbles");

// Let's simulate driving wide for 10 seconds to accumulate marbles and wear
const cleanState = createInitialGameState();
cleanState.kinematics.position = { ...snappedNode.position }; // exactly on centerline

const marbleAccumState = createInitialGameState();
marbleAccumState.kinematics.position = {
  x: snappedNode.position.x + 10.0,
  y: snappedNode.position.y,
  z: snappedNode.position.z + 10.0,
};

// Simulate 50 ticks (dt = 0.1s)
const simDt = 0.1;
for (let i = 0; i < 50; i++) {
  updateVehicleAging(cleanState, track, 0.0, 1.0, 0.0, simDt);
  updateVehicleAging(marbleAccumState, track, 0.0, 1.0, 0.0, simDt);
}

console.log(`- Clean racing line rearLeft wear: ${cleanState.wear.tires.rearLeft.toFixed(6)}`);
console.log(`- Marble accumulated offline rearLeft wear: ${marbleAccumState.wear.tires.rearLeft.toFixed(6)}`);
console.log(`- Marble level offline: ${marbleAccumState.environment.rubberMarbles.toFixed(4)}`);

// Marbles should significantly accelerate tire wear
assert(marbleAccumState.wear.tires.rearLeft > cleanState.wear.tires.rearLeft * 1.5, "Tire wear must be highly accelerated by rubber marbles accumulation");

// Test marbles decay when returning to racing line
marbleAccumState.kinematics.position = { ...snappedNode.position }; // snap back to line
const preDecayMarbles = marbleAccumState.environment.rubberMarbles;
updateVehicleAging(marbleAccumState, track, 0.0, 1.0, 0.0, 1.0); // 1.0s dt
console.log(`- Rubber marbles after returning to clean line (pre: ${preDecayMarbles.toFixed(4)}, post: ${marbleAccumState.environment.rubberMarbles.toFixed(4)})`);
assert(marbleAccumState.environment.rubberMarbles < preDecayMarbles, "Rubber marbles must decay when driving back on the racing line");

console.log("✅ Offline marbles and accelerated tire wear validations completed successfully.\n");

// ============================================================================
// STEP 4: Component Wear Triggering Sensor Failures
// ============================================================================
console.log("Step 4: Verifying Wear-Triggered Sensor Failures...");

const wearState = createInitialGameState();
wearState.kinematics.position = { ...snappedNode.position };

// Verify starting condition
assert(wearState.environment.sensorFailures.tires === false, "Tire sensor should be healthy initially");
assert(wearState.environment.sensorFailures.engineWear === false, "Engine wear sensor should be healthy initially");
assert(wearState.environment.sensorFailures.brakes === false, "Brakes sensor should be healthy initially");
assert(wearState.environment.sensorFailures.rpm === false, "RPM sensor should be healthy initially");

// Threshold 1: frontLeft tire wear > 0.65 triggers tires sensor failure
wearState.wear.tires.frontLeft = 0.66;
updateVehicleAging(wearState, track, 0.0, 0.0, 0.0, dt);
console.log(`- Tires sensor failure after FL tire wear = 0.66: ${wearState.environment.sensorFailures.tires}`);
assert(wearState.environment.sensorFailures.tires === true, "Tire sensor failure must trigger above 0.65 tire wear");

// Threshold 2: engine wear > 0.70 triggers engineWear and engineTemp sensor failure
wearState.wear.engine.wear = 0.71;
updateVehicleAging(wearState, track, 0.0, 0.0, 0.0, dt);
console.log(`- Engine wear sensor failure after engine wear = 0.71: ${wearState.environment.sensorFailures.engineWear}`);
console.log(`- Engine temp sensor failure after engine wear = 0.71: ${wearState.environment.sensorFailures.engineTemp}`);
assert(wearState.environment.sensorFailures.engineWear === true, "Engine wear sensor failure must trigger above 0.70 engine wear");
assert(wearState.environment.sensorFailures.engineTemp === true, "Engine temp sensor failure must trigger above 0.70 engine wear");

// Threshold 3: brakes frontLeft wear > 0.75 triggers brakes sensor failure
wearState.wear.brakes.frontLeft = 0.76;
updateVehicleAging(wearState, track, 0.0, 0.0, 0.0, dt);
console.log(`- Brakes sensor failure after brakes FL wear = 0.76: ${wearState.environment.sensorFailures.brakes}`);
assert(wearState.environment.sensorFailures.brakes === true, "Brake sensor failure must trigger above 0.75 brakes wear");

// Threshold 4: frontLeft tire wear > 0.80 triggers rpm sensor failure (simulating degraded telemetry)
wearState.wear.tires.frontLeft = 0.81;
updateVehicleAging(wearState, track, 0.0, 0.0, 0.0, dt);
console.log(`- RPM sensor failure after FL tire wear = 0.81: ${wearState.environment.sensorFailures.rpm}`);
assert(wearState.environment.sensorFailures.rpm === true, "RPM sensor failure must trigger above 0.80 tire wear");

// Threshold 5: frontRight tire wear > 0.85 triggers throttle sensor failure
wearState.wear.tires.frontRight = 0.86;
updateVehicleAging(wearState, track, 0.0, 0.0, 0.0, dt);
console.log(`- Throttle sensor failure after FR tire wear = 0.86: ${wearState.environment.sensorFailures.throttle}`);
assert(wearState.environment.sensorFailures.throttle === true, "Throttle sensor failure must trigger above 0.85 frontRight tire wear");

// Threshold 6: rearLeft tire wear > 0.85 triggers brake sensor failure
wearState.wear.tires.rearLeft = 0.86;
updateVehicleAging(wearState, track, 0.0, 0.0, 0.0, dt);
console.log(`- Brake sensor failure after RL tire wear = 0.86: ${wearState.environment.sensorFailures.brake}`);
assert(wearState.environment.sensorFailures.brake === true, "Brake sensor failure must trigger above 0.85 rearLeft tire wear");

console.log("✅ Sensor wear failures and degraded telemetry successfully validated.\n");

console.log("🚀 All VibeRacing Progression & Vehicle Aging simulation integration tests completed with 100% success!");
process.exit(0);
