/**
 * VibeRacing GameState Serialization & Simulation Test Suite
 * Validates the bit-packing, alignment, full/partial replication,
 * and baseState delta reconstruction.
 */

import {
  createInitialGameState,
  cloneSharedGameState,
  serializeSharedGameState,
  deserializeSharedGameState,
  ALL_BLOCKS,
  BLOCK_KINEMATICS,
  BLOCK_TELEMETRY,
  BLOCK_METRICS,
  BLOCK_WEAR,
  BLOCK_ENVIRONMENT,
  getSerializedSize,
  SharedGameState
} from "../shared/GameState.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

console.log("🏎️  VIBERACING GAMESTATE SIMULATION & SERIALIZATION TEST 🏎️\n");

// 1. Initial State Creation
console.log("Step 1: Creating initial game state...");
const state = createInitialGameState();
assert(state.sequenceNumber === 0, "Sequence number should start at 0");
assert(state.timestamp === 0, "Timestamp should start at 0");
assert(state.telemetry.rpm === 1000.0, "Initial engine RPM should be 1000.0");
assert(state.telemetry.ersLevel === 1.0, "Initial ERS level should be 1.0");
assert(state.environment.sensorFailures.throttle === false, "Sensor failures should start false");
console.log("✅ Initial state successfully created.");

// 2. Modify State values
console.log("\nStep 2: Modifying state with sample dynamic physics and telemetry values...");
state.timestamp = 1684752000000;
state.sequenceNumber = 420;

// Kinematics
state.kinematics.position = { x: 123.45, y: -67.89, z: 987.65 };
state.kinematics.heading = 1.57079; // ~90 degrees
state.kinematics.velocity = { x: 45.2, y: 0.1, z: -10.5 };
state.kinematics.acceleration = { x: 2.5, y: 0.0, z: -0.8 };

// Telemetry
state.telemetry.throttle = 0.85;
state.telemetry.brake = 0.0;
state.telemetry.ersLevel = 0.72;
state.telemetry.engineMap = 4;
state.telemetry.currentGear = 5;
state.telemetry.rpm = 12450.5;

// Session Metrics
state.metrics.syncStreak = 12;
state.metrics.dataCredits = 1500;
state.metrics.deltaConsistency = 0.985;

// Component Wear
state.wear.tires = {
  frontLeft: 0.12,
  frontRight: 0.14,
  rearLeft: 0.28,
  rearRight: 0.31
};
state.wear.engine = {
  wear: 0.05,
  temperature: 104.5
};
state.wear.brakes = {
  frontLeft: 0.08,
  frontRight: 0.08,
  rearLeft: 0.15,
  rearRight: 0.15
};

// Environment & Sensors
state.environment.rubberMarbles = 0.45;
state.environment.sensorFailures.rpm = true;
state.environment.sensorFailures.engineTemp = true;
console.log("✅ State modifications applied.");

// 3. Full Serialization / Deserialization
console.log("\nStep 3: Performing FULL serialization (ALL_BLOCKS)...");
const fullSize = getSerializedSize(ALL_BLOCKS);
console.log(`- Expected full packet size: ${fullSize} bytes`);
assert(fullSize === 132, `Serialized size must be exactly 132 bytes, got ${fullSize}`);

const fullBuffer = serializeSharedGameState(state, ALL_BLOCKS);
assert(fullBuffer.byteLength === 132, `Buffer byte length must be 132, got ${fullBuffer.byteLength}`);
console.log("- Binary packet generated successfully.");

console.log("Step 4: Deserializing full packet and verifying fields...");
const restoredState = deserializeSharedGameState(fullBuffer);

// Verify Header
assert(restoredState.timestamp === state.timestamp, "Restored timestamp mismatch");
assert(restoredState.sequenceNumber === state.sequenceNumber, "Restored sequenceNumber mismatch");

// Verify Kinematics (Float32 precision checks)
assert(Math.abs(restoredState.kinematics.position.x - 123.45) < 0.001, "position.x mismatch");
assert(Math.abs(restoredState.kinematics.position.y - (-67.89)) < 0.001, "position.y mismatch");
assert(Math.abs(restoredState.kinematics.position.z - 987.65) < 0.001, "position.z mismatch");
assert(Math.abs(restoredState.kinematics.heading - 1.57079) < 0.001, "heading mismatch");
assert(Math.abs(restoredState.kinematics.velocity.x - 45.2) < 0.001, "velocity.x mismatch");

// Verify Telemetry
assert(Math.abs(restoredState.telemetry.throttle - 0.85) < 0.001, "throttle mismatch");
assert(restoredState.telemetry.engineMap === 4, "engineMap mismatch");
assert(restoredState.telemetry.currentGear === 5, "currentGear mismatch");
assert(Math.abs(restoredState.telemetry.rpm - 12450.5) < 0.1, "rpm mismatch");

// Verify Metrics
assert(restoredState.metrics.syncStreak === 12, "syncStreak mismatch");
assert(Math.abs(restoredState.metrics.dataCredits - 1500) < 0.001, "dataCredits mismatch");
assert(Math.abs(restoredState.metrics.deltaConsistency - 0.985) < 0.001, "deltaConsistency mismatch");

// Verify Wear
assert(Math.abs(restoredState.wear.tires.rearRight - 0.31) < 0.001, "rearRight tire wear mismatch");
assert(Math.abs(restoredState.wear.engine.temperature - 104.5) < 0.001, "engine temperature mismatch");
assert(Math.abs(restoredState.wear.brakes.frontLeft - 0.08) < 0.001, "frontLeft brake wear mismatch");

// Verify Environment & Sensor failures
assert(Math.abs(restoredState.environment.rubberMarbles - 0.45) < 0.001, "rubberMarbles mismatch");
assert(restoredState.environment.sensorFailures.rpm === true, "sensorFailures.rpm should be true");
assert(restoredState.environment.sensorFailures.engineTemp === true, "sensorFailures.engineTemp should be true");
assert(restoredState.environment.sensorFailures.throttle === false, "sensorFailures.throttle should be false");
console.log("✅ FULL serialization & deserialization validation PASSED.");

// 4. Partial Serialization (Delta Sync simulation)
console.log("\nStep 5: Simulating 60Hz delta update containing ONLY Kinematics + Telemetry...");
const partialMask = BLOCK_KINEMATICS | BLOCK_TELEMETRY;
const partialSize = getSerializedSize(partialMask);
console.log(`- Expected partial packet size: ${partialSize} bytes`);
assert(partialSize === 16 + 40 + 18, `Partial size must be ${16 + 40 + 18}, got ${partialSize}`); // 74 bytes

// Make an incremental state change in kinematics and telemetry
const incrementalState = cloneSharedGameState(state);
incrementalState.sequenceNumber = 421;
incrementalState.timestamp = state.timestamp + 16.67; // ~60Hz frame time
incrementalState.kinematics.position.x = 124.20; // Moved forward
incrementalState.telemetry.throttle = 0.90; // Pressed throttle more
// These should NOT be sent in the partial sync but we modify them locally to verify they aren't serialized
incrementalState.wear.engine.temperature = 110.0;
incrementalState.environment.rubberMarbles = 0.88;

const partialBuffer = serializeSharedGameState(incrementalState, partialMask);
assert(partialBuffer.byteLength === 74, `Partial buffer must be exactly 74 bytes, got ${partialBuffer.byteLength}`);
console.log("- Partial binary packet generated successfully.");

console.log("Step 6: Deserializing partial packet using restoredState (frame 420) as the baseState...");
const deltaSyncedState = deserializeSharedGameState(partialBuffer, restoredState);

// Verify that the updated values are integrated correctly
assert(deltaSyncedState.sequenceNumber === 421, "Sequence number should update to 421");
assert(deltaSyncedState.timestamp === state.timestamp + 16.67, "Timestamp should update");
assert(Math.abs(deltaSyncedState.kinematics.position.x - 124.20) < 0.001, "Kinematics position should be updated");
assert(Math.abs(deltaSyncedState.telemetry.throttle - 0.90) < 0.001, "Telemetry throttle should be updated");

// Verify that the non-serialized values are correctly preserved from the baseState (frame 420 values)
// rather than being reset to default or using the modified local incrementalState values
assert(Math.abs(deltaSyncedState.wear.engine.temperature - 104.5) < 0.001, "Wear should be preserved from baseState (104.5)");
assert(Math.abs(deltaSyncedState.environment.rubberMarbles - 0.45) < 0.001, "Environment should be preserved from baseState (0.45)");
console.log("✅ Partial serialization delta synchronization validation PASSED.");

console.log("\n🚀 All VibeRacing GameState validations completed with 100% success!");
process.exit(0);
