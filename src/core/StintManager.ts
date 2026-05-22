import { SharedGameState } from "../shared/GameState.js";
import { TrackGenerator } from "../shared/TrackGenerator.js";
import { calculateEndStintCredits } from "../shared/Progression.js";

const DRIVER_KEY_POOL = ['W', 'A', 'S', 'D', 'Q', 'E', 'R', 'F', 'Z', 'X', 'C'];
const ENGINEER_KEY_POOL = ['I', 'O', 'P', 'J', 'K', 'L', 'U', 'Y', 'H', 'N', 'M'];

function getRandomKey(pool: string[], currentKey?: string): string {
  const choices = currentKey ? pool.filter(k => k.toLowerCase() !== currentKey.toLowerCase()) : pool;
  const activeChoices = choices.length > 0 ? choices : pool;
  const randomIndex = Math.floor(Math.random() * activeChoices.length);
  return activeChoices[randomIndex];
}

function getPoolForStep(step: number): string[] {
  return (step === 0 || step === 2) ? DRIVER_KEY_POOL : ENGINEER_KEY_POOL;
}

function getRoleForStep(step: number): 'driver' | 'engineer' | null {
  if (step === 0 || step === 2) return 'driver';
  if (step === 1 || step === 3) return 'engineer';
  return null;
}

export class StintManager {
  public role: 'driver' | 'engineer';
  public onRoleSwapped?: (newRole: 'driver' | 'engineer') => void;

  // Stint configuration metrics for end of stint calculation
  public syncAccuracy: number = 0.95;
  public ersConsumed: number = 40.0;
  public ersTarget: number = 40.0;

  // Timestamps for Stage 2 simultaneous tapping
  private lastDriverSpaceTap: number | null = null;
  private lastEngineerSpaceTap: number | null = null;

  constructor(initialRole: 'driver' | 'engineer' = 'driver') {
    this.role = initialRole;
  }

  /**
   * Enters the pit stop sequence, locking control inputs and resetting telemetry sensor failures.
   */
  public enterPitStop(state: SharedGameState): void {
    const flKey = getRandomKey(DRIVER_KEY_POOL);
    const frKey = getRandomKey(ENGINEER_KEY_POOL);
    const rlKey = getRandomKey(DRIVER_KEY_POOL, flKey);
    const rrKey = getRandomKey(ENGINEER_KEY_POOL, frKey);

    const tiresState = {
      frontLeft: { targetKey: flKey, done: false, role: 'driver' as const },
      frontRight: { targetKey: frKey, done: false, role: 'engineer' as const },
      rearLeft: { targetKey: rlKey, done: false, role: 'driver' as const },
      rearRight: { targetKey: rrKey, done: false, role: 'engineer' as const }
    };

    if (!state.pitStop) {
      state.pitStop = {
        active: true,
        stage: 'TIRES',
        tireStep: 0,
        fuelSyncTaps: 0,
        targetKey: flKey,
        tires: tiresState
      };
    } else {
      state.pitStop.active = true;
      state.pitStop.stage = 'TIRES';
      state.pitStop.tireStep = 0;
      state.pitStop.fuelSyncTaps = 0;
      state.pitStop.targetKey = flKey;
      state.pitStop.tires = tiresState;
    }

    this.lastDriverSpaceTap = null;
    this.lastEngineerSpaceTap = null;

    // Reset sensor failures as mechanics connect diagnostics
    state.environment.sensorFailures.tires = false;
    state.environment.sensorFailures.engineWear = false;
    state.environment.sensorFailures.engineTemp = false;
    state.environment.sensorFailures.brakes = false;
    state.environment.sensorFailures.throttle = false;
    state.environment.sensorFailures.brake = false;
    state.environment.sensorFailures.ersLevel = false;
    state.environment.sensorFailures.engineMap = false;
    state.environment.sensorFailures.currentGear = false;
    state.environment.sensorFailures.rpm = false;
    state.environment.sensorFailures.velocity = false;
    state.environment.sensorFailures.rubberMarbles = false;
  }

  /**
   * Tracks snapped node and speed to trigger pit stop automatically.
   */
  public update(state: SharedGameState, track: TrackGenerator): void {
    // If already in a pit stop, we ensure sensor failures remain clear and inputs locked
    if (state.pitStop && state.pitStop.active) {
      state.environment.sensorFailures.tires = false;
      state.environment.sensorFailures.engineWear = false;
      state.environment.sensorFailures.engineTemp = false;
      state.environment.sensorFailures.brakes = false;
      state.environment.sensorFailures.throttle = false;
      state.environment.sensorFailures.brake = false;
      state.environment.sensorFailures.ersLevel = false;
      state.environment.sensorFailures.engineMap = false;
      state.environment.sensorFailures.currentGear = false;
      state.environment.sensorFailures.rpm = false;
      state.environment.sensorFailures.velocity = false;
      state.environment.sensorFailures.rubberMarbles = false;
      return;
    }

    const { x, z } = state.kinematics.position;
    const snappedNode = track.findClosestNode(x, z);

    const velVec = state.kinematics.velocity;
    const speed = Math.sqrt(velVec.x * velVec.x + velVec.y * velVec.y + velVec.z * velVec.z);

    if (snappedNode.index >= 975 && snappedNode.index <= 985 && speed <= 3.0) {
      this.enterPitStop(state);
    }
  }

  /**
   * Processes the key press minigame stages.
   * 
   * Stage 1 ('TIRES'): Sequential coordinated keystrokes
   * - Step 0: Driver must press dynamic targetKey from Driver pool.
   * - Step 1: Engineer must press dynamic targetKey from Engineer pool.
   * - Step 2: Driver must press dynamic targetKey from Driver pool.
   * - Step 3: Engineer must press dynamic targetKey from Engineer pool.
   * 
   * Stage 2 ('REFUEL'): Coordinated simultaneous tapping
   * - Both driver and engineer must press 'Space' key within 300ms of each other.
   * - 5 synchronized taps are required.
   */
  public handleKeyPress(state: SharedGameState, inputRole: 'driver' | 'engineer', key: string, timestamp: number): void {
    if (!state.pitStop || !state.pitStop.active) return;

    const lowerKey = key.toLowerCase();

    if (state.pitStop.stage === 'TIRES') {
      const step = state.pitStop.tireStep;
      const expectedRole = getRoleForStep(step);
      if (expectedRole && inputRole === expectedRole) {
        const target = state.pitStop.targetKey || '';
        if (lowerKey === target.toLowerCase()) {
          // Mark active tire as done
          if (state.pitStop.tires) {
            if (step === 0) state.pitStop.tires.frontLeft.done = true;
            if (step === 1) state.pitStop.tires.frontRight.done = true;
            if (step === 2) state.pitStop.tires.rearLeft.done = true;
            if (step === 3) state.pitStop.tires.rearRight.done = true;
          }

          const nextStep = step + 1;
          state.pitStop.tireStep = nextStep;
          if (nextStep >= 4) {
            state.pitStop.stage = 'REFUEL';
            state.pitStop.targetKey = undefined;
          } else {
            if (state.pitStop.tires) {
              let nextKey = '';
              if (nextStep === 1) nextKey = state.pitStop.tires.frontRight.targetKey;
              if (nextStep === 2) nextKey = state.pitStop.tires.rearLeft.targetKey;
              if (nextStep === 3) nextKey = state.pitStop.tires.rearRight.targetKey;
              state.pitStop.targetKey = nextKey;
            } else {
              state.pitStop.targetKey = getRandomKey(getPoolForStep(nextStep));
            }
          }
        } else {
          // Mismatched keystroke! Trigger mis-press penalty (new target key, same step)
          const newKey = getRandomKey(getPoolForStep(step), target);
          state.pitStop.targetKey = newKey;
          if (state.pitStop.tires) {
            if (step === 0) state.pitStop.tires.frontLeft.targetKey = newKey;
            if (step === 1) state.pitStop.tires.frontRight.targetKey = newKey;
            if (step === 2) state.pitStop.tires.rearLeft.targetKey = newKey;
            if (step === 3) state.pitStop.tires.rearRight.targetKey = newKey;
          }
        }
      }
    } else if (state.pitStop.stage === 'REFUEL') {
      if (key === ' ' || lowerKey === 'space') {
        if (inputRole === 'driver') {
          this.lastDriverSpaceTap = timestamp;
          if (this.lastEngineerSpaceTap !== null && Math.abs(timestamp - this.lastEngineerSpaceTap) <= 300) {
            state.pitStop.fuelSyncTaps += 1;
            this.lastDriverSpaceTap = null;
            this.lastEngineerSpaceTap = null;
          }
        } else if (inputRole === 'engineer') {
          this.lastEngineerSpaceTap = timestamp;
          if (this.lastDriverSpaceTap !== null && Math.abs(timestamp - this.lastDriverSpaceTap) <= 300) {
            state.pitStop.fuelSyncTaps += 1;
            this.lastDriverSpaceTap = null;
            this.lastEngineerSpaceTap = null;
          }
        }

        if (state.pitStop.fuelSyncTaps >= 5) {
          state.pitStop.stage = 'COMPLETE';
          this.completePitStop(state);
        }
      }
    }
  }

  /**
   * Completes the pit stop, resets vehicle wear, calculates credits, and swaps WebRTC roles.
   */
  public completePitStop(state: SharedGameState): void {
    if (state.pitStop) {
      state.pitStop.active = false;
      state.pitStop.stage = 'COMPLETE';
    }

    // Reset vehicle wear
    state.wear.tires.frontLeft = 0.0;
    state.wear.tires.frontRight = 0.0;
    state.wear.tires.rearLeft = 0.0;
    state.wear.tires.rearRight = 0.0;

    state.wear.brakes.frontLeft = 0.0;
    state.wear.brakes.frontRight = 0.0;
    state.wear.brakes.rearLeft = 0.0;
    state.wear.brakes.rearRight = 0.0;

    state.wear.engine.wear = 0.0;
    state.wear.engine.temperature = 80.0;

    // Calculate end-of-stint credits
    const syncAccuracy = this.syncAccuracy;
    const deltaConsistency = state.metrics.deltaConsistency;
    const ersConsumed = this.ersConsumed;
    const ersTarget = this.ersTarget;
    const syncStreak = state.metrics.syncStreak;

    const credits = calculateEndStintCredits(
      syncAccuracy,
      deltaConsistency,
      ersConsumed,
      ersTarget,
      syncStreak
    );
    state.metrics.dataCredits += credits;

    // Invert roles
    const oldRole = this.role;
    this.role = oldRole === 'driver' ? 'engineer' : 'driver';

    // Trigger role swap callback
    if (this.onRoleSwapped) {
      this.onRoleSwapped(this.role);
    }
  }
}
