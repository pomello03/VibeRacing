import { SharedGameState } from "./GameState.js";
import { TrackGenerator } from "./TrackGenerator.js";

/**
 * Calculates data credits awarded at the end of a stint.
 * 
 * Score composition:
 * - 40% Sync Accuracy
 * - 30% Delta Consistency
 * - 30% ERS Consumption compliance
 * 
 * Credits = 1000 * score * (1 + syncStreak * 0.05)
 *
 * @param syncAccuracy Engineer typing sync accuracy (0.0 to 1.0)
 * @param deltaConsistency Driver consistency score (0.0 to 1.0)
 * @param ersConsumed Amount of ERS energy consumed during the stint
 * @param ersTarget Target ERS energy consumption set for the stint
 * @param syncStreak Current streak of correct engineer inputs (multiplier modifier)
 */
export function calculateEndStintCredits(
  syncAccuracy: number,
  deltaConsistency: number,
  ersConsumed: number,
  ersTarget: number,
  syncStreak: number = 0
): number {
  const compliance = ersTarget > 0
    ? Math.max(0.0, Math.min(1.0, 1.0 - Math.abs(ersConsumed - ersTarget) / ersTarget))
    : 0.0;
  
  const score = 0.4 * syncAccuracy + 0.3 * deltaConsistency + 0.3 * compliance;
  return 1000 * score * (1 + syncStreak * 0.05);
}

/**
 * Updates the physical wear of the vehicle components and manages the environment (marbles) based on kinematics.
 * Also triggers telemetry sensor failures when component wear exceeds specific failure thresholds.
 *
 * @param state SharedGameState of the current simulation tick
 * @param track TrackGenerator defining the procedural spline track
 * @param steering Steering input value (-1.0 to 1.0, left to right)
 * @param throttle Throttle input value (0.0 to 1.0)
 * @param brake Brake input value (0.0 to 1.0)
 * @param dt Delta time for the current tick in seconds
 */
export function updateVehicleAging(
  state: SharedGameState,
  track: TrackGenerator,
  steering: number,
  throttle: number,
  brake: number,
  dt: number
): void {
  // 1. Read vehicle position and find closest track node
  const { x, y, z } = state.kinematics.position;
  const snappedNode = track.findClosestNode(x, z);

  // 2. Calculate Euclidean distance (offset) from vehicle position to track node position
  const dx = x - snappedNode.position.x;
  const dy = y - snappedNode.position.y;
  const dz = z - snappedNode.position.z;
  const offset = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // 3. Track Offset Marbles Accumulation
  // If the vehicle's offset is > 30% of the track node's width, rubber marbles pile up
  const threshold = 0.3 * snappedNode.width;
  if (offset > threshold) {
    state.environment.rubberMarbles = Math.min(1.0, state.environment.rubberMarbles + 0.15 * dt);
  } else {
    // If the vehicle is on the clean racing line, rubber marbles clean off slowly
    state.environment.rubberMarbles = Math.max(0.0, state.environment.rubberMarbles - 0.05 * dt);
  }

  // 4. Asymmetric Tire Wear and Component Wear
  // Base tire wear tick: front tires FL/FR base wear is 0.0005 * dt, rear tires RL/RR base wear is 0.0004 * dt
  let wearFL = 0.0005 * dt;
  let wearFR = 0.0005 * dt;
  let wearRL = 0.0004 * dt;
  let wearRR = 0.0004 * dt;

  // Scale tire wear based on steering (lateral loading)
  // Steering > 0 (Right Turn) loads outer (left) tires
  if (steering > 0) {
    wearFL += steering * 0.002 * dt;
    wearRL += steering * 0.002 * dt;
  }
  // Steering < 0 (Left Turn) loads outer (right) tires
  else if (steering < 0) {
    const absSteer = Math.abs(steering);
    wearFR += absSteer * 0.002 * dt;
    wearRR += absSteer * 0.002 * dt;
  }

  // Scale tire wear based on powertrain forces (Acceleration wears rear tires, Braking wears front tires)
  if (throttle > 0) {
    wearRL += throttle * 0.001 * dt;
    wearRR += throttle * 0.001 * dt;
  }
  if (brake > 0) {
    wearFL += brake * 0.0015 * dt;
    wearFR += brake * 0.0015 * dt;
  }

  // Multiply all wear increments by marbles penalty factor: (1.0 + rubberMarbles * 8.0)
  const marblesMultiplier = 1.0 + state.environment.rubberMarbles * 8.0;
  wearFL *= marblesMultiplier;
  wearFR *= marblesMultiplier;
  wearRL *= marblesMultiplier;
  wearRR *= marblesMultiplier;

  // Apply tire wear to the state and clamp to [0, 1]
  state.wear.tires.frontLeft = Math.max(0.0, Math.min(1.0, state.wear.tires.frontLeft + wearFL));
  state.wear.tires.frontRight = Math.max(0.0, Math.min(1.0, state.wear.tires.frontRight + wearFR));
  state.wear.tires.rearLeft = Math.max(0.0, Math.min(1.0, state.wear.tires.rearLeft + wearRL));
  state.wear.tires.rearRight = Math.max(0.0, Math.min(1.0, state.wear.tires.rearRight + wearRR));

  // 5. Engine Wear Update
  // Engine wear increments by (0.0002 * throttle * dt) + (0.0001 * dt)
  const engineWearInc = (0.0002 * throttle * dt) + (0.0001 * dt);
  state.wear.engine.wear = Math.max(0.0, Math.min(1.0, state.wear.engine.wear + engineWearInc));

  // Update brakes wear if braking
  if (brake > 0) {
    const brakeWearInc = brake * 0.0015 * dt * marblesMultiplier;
    state.wear.brakes.frontLeft = Math.max(0.0, Math.min(1.0, state.wear.brakes.frontLeft + brakeWearInc));
    state.wear.brakes.frontRight = Math.max(0.0, Math.min(1.0, state.wear.brakes.frontRight + brakeWearInc));
    state.wear.brakes.rearLeft = Math.max(0.0, Math.min(1.0, state.wear.brakes.rearLeft + brakeWearInc));
    state.wear.brakes.rearRight = Math.max(0.0, Math.min(1.0, state.wear.brakes.rearRight + brakeWearInc));
  }

  // 6. Sensor Failures and Telemetry Degradation
  // If frontLeft tire wear > 0.65, set state.environment.sensorFailures.tires = true (blocks tire UI)
  if (state.wear.tires.frontLeft > 0.65) {
    state.environment.sensorFailures.tires = true;
  }

  // If engine wear > 0.70, set state.environment.sensorFailures.engineWear = true and engineTemp = true
  if (state.wear.engine.wear > 0.70) {
    state.environment.sensorFailures.engineWear = true;
    state.environment.sensorFailures.engineTemp = true;
  }

  // If brakes frontLeft wear (or tires FL wear) > 0.75, set state.environment.sensorFailures.brakes = true
  if (state.wear.brakes.frontLeft > 0.75 || state.wear.tires.frontLeft > 0.75) {
    state.environment.sensorFailures.brakes = true;
  }

  // Degraded Telemetry Simulator: If any sensor failures are true, or as wear increases, trigger other failures
  if (state.wear.tires.frontLeft > 0.80) {
    state.environment.sensorFailures.rpm = true;
  }
  if (state.wear.tires.frontRight > 0.85) {
    state.environment.sensorFailures.throttle = true;
  }
  if (state.wear.tires.rearLeft > 0.85) {
    state.environment.sensorFailures.brake = true;
  }
}
