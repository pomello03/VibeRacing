/**
 * VibeRacing Shared Game State & Binary Replication Architecture
 * Compliant with physics-core and style-ui directives.
 *
 * This file defines the core data structures representing the common game state
 * and implements high-performance binary serialization/deserialization for 60Hz P2P replication
 * over WebRTC DataChannels (unordered, virtual UDP).
 */

/**
 * 3D Coordinate or Vector representation (e.g., position, velocity, acceleration).
 */
export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Vehicle Kinematics tracking the physical movement of the driver's car.
 */
export interface Kinematics {
  position: Vector3D;
  heading: number; // Yaw angle in radians
  velocity: Vector3D; // m/s
  acceleration: Vector3D; // m/s^2
}

/**
 * Real-time driver telemetry inputs and powertrain statuses.
 */
export interface Telemetry {
  throttle: number; // 0.0 (idle) to 1.0 (100% depressed)
  brake: number; // 0.0 (open) to 1.0 (100% depressed)
  ersLevel: number; // 0.0 (empty) to 1.0 (100% capacity)
  engineMap: number; // Discrete setting, e.g., 1 (eco) to 5 (qualifying/max power)
  currentGear: number; // -1 = Reverse, 0 = Neutral, 1-8 = Forward gears
  rpm: number; // Engine revolutions per minute (0.0 to ~15000.0)
}

/**
 * Rogue-lite and Session progression metrics.
 */
export interface SessionMetrics {
  syncStreak: number; // Engineer typing accuracy streak (multiplier for buffs/rewards)
  dataCredits: number; // Stint currency earned via sync streak and telemetries
  deltaConsistency: number; // Driver's timing consistency metric (0.0 to 1.0)
}

/**
 * Asymmetric component wear metrics tracking parts longevity and degradation.
 */
export interface ComponentWear {
  tires: {
    frontLeft: number; // 0.0 (pristine) to 1.0 (fully degraded/blown)
    frontRight: number;
    rearLeft: number;
    rearRight: number;
  };
  engine: {
    wear: number; // 0.0 to 1.0
    temperature: number; // Degrees Celsius
  };
  brakes: {
    frontLeft: number; // 0.0 to 1.0
    frontRight: number;
    rearLeft: number;
    rearRight: number;
  };
}

/**
 * Discrete flag mappings representing partial sensor failures on the engineer's telemetry board.
 */
export interface SensorFailures {
  throttle: boolean;
  brake: boolean;
  ersLevel: boolean;
  engineMap: boolean;
  currentGear: boolean;
  rpm: boolean;
  velocity: boolean;
  tires: boolean;
  engineWear: boolean;
  engineTemp: boolean;
  brakes: boolean;
  rubberMarbles: boolean;
  misShift: boolean;
}

/**
 * Session environmental elements affecting vehicle dynamics.
 */
export interface EnvironmentalFactors {
  rubberMarbles: number; // Marbles accumulation outside racing line (0.0 to 1.0, grip drops to zero at max)
  sensorFailures: SensorFailures;
}

/**
 * Consolidated Shared Game State representing a single synchronized tick.
 */
export interface SharedGameState {
  timestamp: number; // Milliseconds elapsed in session
  sequenceNumber: number; // Monotonically increasing frame index (60Hz tick count)
  kinematics: Kinematics;
  telemetry: Telemetry;
  metrics: SessionMetrics;
  wear: ComponentWear;
  environment: EnvironmentalFactors;
  pitStop?: {
    active: boolean;
    stage: 'NONE' | 'TIRES' | 'REFUEL' | 'COMPLETE';
    tireStep: number;
    fuelSyncTaps: number;
    targetKey?: string;
    tires?: {
      frontLeft: { targetKey: string; done: boolean; role: 'driver' | 'engineer' };
      frontRight: { targetKey: string; done: boolean; role: 'driver' | 'engineer' };
      rearLeft: { targetKey: string; done: boolean; role: 'driver' | 'engineer' };
      rearRight: { targetKey: string; done: boolean; role: 'driver' | 'engineer' };
    };
  };
}


// ==========================================
// Binary Replication Protocol & Block Constants
// ==========================================

export const BLOCK_KINEMATICS  = 1 << 0; // 0x01
export const BLOCK_TELEMETRY   = 1 << 1; // 0x02
export const BLOCK_METRICS     = 1 << 2; // 0x04
export const BLOCK_WEAR        = 1 << 3; // 0x08
export const BLOCK_ENVIRONMENT = 1 << 4; // 0x10

export const ALL_BLOCKS =
  BLOCK_KINEMATICS | BLOCK_TELEMETRY | BLOCK_METRICS | BLOCK_WEAR | BLOCK_ENVIRONMENT; // 0x1F

/**
 * Calculates the exact byte length needed to serialize the state with the given blocks enabled.
 * Packets are optimized to be as compact as possible for 60Hz transmissions.
 *
 * Binary Layout:
 * - Header (16 bytes, perfectly aligned):
 *   - [0]: blocksMask (uint8)
 *   - [1]: Padding (uint8)
 *   - [2-3]: Padding (uint16)
 *   - [4-7]: sequenceNumber (uint32)
 *   - [8-15]: timestamp (float64)
 *
 * - Block 0 (Kinematics - 40 bytes):
 *   - [0-3]: position.x (float32)
 *   - [4-7]: position.y (float32)
 *   - [8-11]: position.z (float32)
 *   - [12-15]: heading (float32)
 *   - [16-19]: velocity.x (float32)
 *   - [20-23]: velocity.y (float32)
 *   - [24-27]: velocity.z (float32)
 *   - [28-31]: acceleration.x (float32)
 *   - [32-35]: acceleration.y (float32)
 *   - [36-39]: acceleration.z (float32)
 *
 * - Block 1 (Telemetry - 18 bytes):
 *   - [0-3]: throttle (float32)
 *   - [4-7]: brake (float32)
 *   - [8-11]: ersLevel (float32)
 *   - [12-15]: rpm (float32)
 *   - [16]: engineMap (uint8)
 *   - [17]: currentGear (int8)
 *
 * - Block 2 (Metrics - 12 bytes):
 *   - [0-3]: syncStreak (uint32)
 *   - [4-7]: dataCredits (float32)
 *   - [8-11]: deltaConsistency (float32)
 *
 * - Block 3 (Component Wear - 40 bytes):
 *   - [0-3]: tireWearFL (float32)
 *   - [4-7]: tireWearFR (float32)
 *   - [8-11]: tireWearRL (float32)
 *   - [12-15]: tireWearRR (float32)
 *   - [16-19]: engineWear (float32)
 *   - [20-23]: engineTemp (float32)
 *   - [24-27]: brakeWearFL (float32)
 *   - [28-31]: brakeWearFR (float32)
 *   - [32-35]: brakeWearRL (float32)
 *   - [36-39]: brakeWearRR (float32)
 *
 * - Block 4 (Environment - 6 bytes):
 *   - [0-3]: rubberMarbles (float32)
 *   - [4-5]: sensorFailures (uint16 bitmask)
 */
export function getSerializedSize(blocksMask: number): number {
  let size = 16; // Header
  if (blocksMask & BLOCK_KINEMATICS) size += 40;
  if (blocksMask & BLOCK_TELEMETRY) size += 18;
  if (blocksMask & BLOCK_METRICS) size += 12;
  if (blocksMask & BLOCK_WEAR) size += 40;
  if (blocksMask & BLOCK_ENVIRONMENT) size += 6;
  return size;
}

/**
 * Creates an empty, pristine initial SharedGameState state.
 */
export function createInitialGameState(): SharedGameState {
  return {
    timestamp: 0,
    sequenceNumber: 0,
    kinematics: {
      position: { x: 0, y: 0, z: 0 },
      heading: 0,
      velocity: { x: 0, y: 0, z: 0 },
      acceleration: { x: 0, y: 0, z: 0 },
    },
    telemetry: {
      throttle: 0,
      brake: 0,
      ersLevel: 1.0, // Full power
      engineMap: 1, // Default map
      currentGear: 0, // Neutral
      rpm: 1000.0, // Idle
    },
    metrics: {
      syncStreak: 0,
      dataCredits: 0,
      deltaConsistency: 1.0, // Perfect consistency score start
    },
    wear: {
      tires: {
        frontLeft: 0,
        frontRight: 0,
        rearLeft: 0,
        rearRight: 0,
      },
      engine: {
        wear: 0,
        temperature: 80.0, // Normal operating engine temperature
      },
      brakes: {
        frontLeft: 0,
        frontRight: 0,
        rearLeft: 0,
        rearRight: 0,
      },
    },
    environment: {
      rubberMarbles: 0,
      sensorFailures: {
        throttle: false,
        brake: false,
        ersLevel: false,
        engineMap: false,
        currentGear: false,
        rpm: false,
        velocity: false,
        tires: false,
        engineWear: false,
        engineTemp: false,
        brakes: false,
        rubberMarbles: false,
        misShift: false,
      },
    },
  };
}

/**
 * Clones a SharedGameState deep-copying all sub-structures to avoid shared references.
 */
export function cloneSharedGameState(state: SharedGameState): SharedGameState {
  return {
    timestamp: state.timestamp,
    sequenceNumber: state.sequenceNumber,
    kinematics: {
      position: { ...state.kinematics.position },
      heading: state.kinematics.heading,
      velocity: { ...state.kinematics.velocity },
      acceleration: { ...state.kinematics.acceleration },
    },
    telemetry: { ...state.telemetry },
    metrics: { ...state.metrics },
    wear: {
      tires: { ...state.wear.tires },
      engine: { ...state.wear.engine },
      brakes: { ...state.wear.brakes },
    },
    environment: {
      rubberMarbles: state.environment.rubberMarbles,
      sensorFailures: { ...state.environment.sensorFailures },
    },
    pitStop: state.pitStop ? {
      ...state.pitStop,
      tires: state.pitStop.tires ? {
        frontLeft: { ...state.pitStop.tires.frontLeft },
        frontRight: { ...state.pitStop.tires.frontRight },
        rearLeft: { ...state.pitStop.tires.rearLeft },
        rearRight: { ...state.pitStop.tires.rearRight }
      } : undefined
    } : undefined,
  };
}


/**
 * High-performance binary serialization. Packs full or partial state into a Uint8Array.
 * Set blocksMask to include only specific blocks (e.g. at 60Hz we might only send Kinematics and Telemetry).
 *
 * @param state The state object to serialize
 * @param blocksMask The active blocks to pack in the binary structure (default: ALL_BLOCKS)
 */
export function serializeSharedGameState(
  state: SharedGameState,
  blocksMask: number = ALL_BLOCKS
): Uint8Array {
  const size = getSerializedSize(blocksMask);
  const buffer = new Uint8Array(size);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  let offset = 0;

  // 1. Header (16 bytes)
  view.setUint8(offset, blocksMask);
  view.setUint8(offset + 1, 0); // Padding
  view.setUint16(offset + 2, 0, true); // Padding
  view.setUint32(offset + 4, state.sequenceNumber, true);
  view.setFloat64(offset + 8, state.timestamp, true);
  offset += 16;

  // 2. Block 0: Kinematics (40 bytes)
  if (blocksMask & BLOCK_KINEMATICS) {
    view.setFloat32(offset, state.kinematics.position.x, true);
    view.setFloat32(offset + 4, state.kinematics.position.y, true);
    view.setFloat32(offset + 8, state.kinematics.position.z, true);
    view.setFloat32(offset + 12, state.kinematics.heading, true);
    view.setFloat32(offset + 16, state.kinematics.velocity.x, true);
    view.setFloat32(offset + 20, state.kinematics.velocity.y, true);
    view.setFloat32(offset + 24, state.kinematics.velocity.z, true);
    view.setFloat32(offset + 28, state.kinematics.acceleration.x, true);
    view.setFloat32(offset + 32, state.kinematics.acceleration.y, true);
    view.setFloat32(offset + 36, state.kinematics.acceleration.z, true);
    offset += 40;
  }

  // 3. Block 1: Telemetry (18 bytes)
  if (blocksMask & BLOCK_TELEMETRY) {
    view.setFloat32(offset, state.telemetry.throttle, true);
    view.setFloat32(offset + 4, state.telemetry.brake, true);
    view.setFloat32(offset + 8, state.telemetry.ersLevel, true);
    view.setFloat32(offset + 12, state.telemetry.rpm, true);
    view.setUint8(offset + 16, state.telemetry.engineMap);
    view.setInt8(offset + 17, state.telemetry.currentGear);
    offset += 18;
  }

  // 4. Block 2: Metrics (12 bytes)
  if (blocksMask & BLOCK_METRICS) {
    view.setUint32(offset, state.metrics.syncStreak, true);
    view.setFloat32(offset + 4, state.metrics.dataCredits, true);
    view.setFloat32(offset + 8, state.metrics.deltaConsistency, true);
    offset += 12;
  }

  // 5. Block 3: Component Wear (40 bytes)
  if (blocksMask & BLOCK_WEAR) {
    // Tires
    view.setFloat32(offset, state.wear.tires.frontLeft, true);
    view.setFloat32(offset + 4, state.wear.tires.frontRight, true);
    view.setFloat32(offset + 8, state.wear.tires.rearLeft, true);
    view.setFloat32(offset + 12, state.wear.tires.rearRight, true);
    // Engine
    view.setFloat32(offset + 16, state.wear.engine.wear, true);
    view.setFloat32(offset + 20, state.wear.engine.temperature, true);
    // Brakes
    view.setFloat32(offset + 24, state.wear.brakes.frontLeft, true);
    view.setFloat32(offset + 28, state.wear.brakes.frontRight, true);
    view.setFloat32(offset + 32, state.wear.brakes.rearLeft, true);
    view.setFloat32(offset + 36, state.wear.brakes.rearRight, true);
    offset += 40;
  }

  // 6. Block 4: Environment & Sensor Failures (6 bytes)
  if (blocksMask & BLOCK_ENVIRONMENT) {
    view.setFloat32(offset, state.environment.rubberMarbles, true);

    let sensorMask = 0;
    const failures = state.environment.sensorFailures;
    if (failures.throttle) sensorMask |= 1 << 0;
    if (failures.brake) sensorMask |= 1 << 1;
    if (failures.ersLevel) sensorMask |= 1 << 2;
    if (failures.engineMap) sensorMask |= 1 << 3;
    if (failures.currentGear) sensorMask |= 1 << 4;
    if (failures.rpm) sensorMask |= 1 << 5;
    if (failures.velocity) sensorMask |= 1 << 6;
    if (failures.tires) sensorMask |= 1 << 7;
    if (failures.engineWear) sensorMask |= 1 << 8;
    if (failures.engineTemp) sensorMask |= 1 << 9;
    if (failures.brakes) sensorMask |= 1 << 10;
    if (failures.rubberMarbles) sensorMask |= 1 << 11;
    if (failures.misShift) sensorMask |= 1 << 12;

    view.setUint16(offset + 4, sensorMask, true);
    offset += 6;
  }

  return buffer;
}

/**
 * Deserializes an ArrayBuffer or ArrayBufferView back into a SharedGameState.
 *
 * @param buffer The binary buffer received from WebRTC
 * @param baseState Optional base state. If provided, values not present in the packet
 *                  will be cloned/kept from this baseState (enabling lightweight delta sync).
 */
export function deserializeSharedGameState(
  buffer: ArrayBuffer | ArrayBufferView,
  baseState?: SharedGameState
): SharedGameState {
  const arrayBuffer = buffer instanceof ArrayBuffer ? buffer : buffer.buffer;
  const byteOffset = buffer instanceof ArrayBuffer ? 0 : buffer.byteOffset;
  const byteLength = buffer instanceof ArrayBuffer ? buffer.byteLength : buffer.byteLength;
  const view = new DataView(arrayBuffer, byteOffset, byteLength);

  let offset = 0;

  // 1. Header (16 bytes)
  const blocksMask = view.getUint8(offset);
  const sequenceNumber = view.getUint32(offset + 4, true);
  const timestamp = view.getFloat64(offset + 8, true);
  offset += 16;

  // Construct working object cloning from baseState if it exists
  const result = baseState ? cloneSharedGameState(baseState) : createInitialGameState();
  result.sequenceNumber = sequenceNumber;
  result.timestamp = timestamp;

  // 2. Block 0: Kinematics (40 bytes)
  if (blocksMask & BLOCK_KINEMATICS) {
    result.kinematics.position.x = view.getFloat32(offset, true);
    result.kinematics.position.y = view.getFloat32(offset + 4, true);
    result.kinematics.position.z = view.getFloat32(offset + 8, true);
    result.kinematics.heading = view.getFloat32(offset + 12, true);
    result.kinematics.velocity.x = view.getFloat32(offset + 16, true);
    result.kinematics.velocity.y = view.getFloat32(offset + 20, true);
    result.kinematics.velocity.z = view.getFloat32(offset + 24, true);
    result.kinematics.acceleration.x = view.getFloat32(offset + 28, true);
    result.kinematics.acceleration.y = view.getFloat32(offset + 32, true);
    result.kinematics.acceleration.z = view.getFloat32(offset + 36, true);
    offset += 40;
  }

  // 3. Block 1: Telemetry (18 bytes)
  if (blocksMask & BLOCK_TELEMETRY) {
    result.telemetry.throttle = view.getFloat32(offset, true);
    result.telemetry.brake = view.getFloat32(offset + 4, true);
    result.telemetry.ersLevel = view.getFloat32(offset + 8, true);
    result.telemetry.rpm = view.getFloat32(offset + 12, true);
    result.telemetry.engineMap = view.getUint8(offset + 16);
    result.telemetry.currentGear = view.getInt8(offset + 17);
    offset += 18;
  }

  // 4. Block 2: Metrics (12 bytes)
  if (blocksMask & BLOCK_METRICS) {
    result.metrics.syncStreak = view.getUint32(offset, true);
    result.metrics.dataCredits = view.getFloat32(offset + 4, true);
    result.metrics.deltaConsistency = view.getFloat32(offset + 8, true);
    offset += 12;
  }

  // 5. Block 3: Component Wear (40 bytes)
  if (blocksMask & BLOCK_WEAR) {
    result.wear.tires.frontLeft = view.getFloat32(offset, true);
    result.wear.tires.frontRight = view.getFloat32(offset + 4, true);
    result.wear.tires.rearLeft = view.getFloat32(offset + 8, true);
    result.wear.tires.rearRight = view.getFloat32(offset + 12, true);

    result.wear.engine.wear = view.getFloat32(offset + 16, true);
    result.wear.engine.temperature = view.getFloat32(offset + 20, true);

    result.wear.brakes.frontLeft = view.getFloat32(offset + 24, true);
    result.wear.brakes.frontRight = view.getFloat32(offset + 28, true);
    result.wear.brakes.rearLeft = view.getFloat32(offset + 32, true);
    result.wear.brakes.rearRight = view.getFloat32(offset + 36, true);
    offset += 40;
  }

  // 6. Block 4: Environment & Sensors (6 bytes)
  if (blocksMask & BLOCK_ENVIRONMENT) {
    result.environment.rubberMarbles = view.getFloat32(offset, true);

    const sensorMask = view.getUint16(offset + 4, true);
    const failures = result.environment.sensorFailures;
    failures.throttle = (sensorMask & (1 << 0)) !== 0;
    failures.brake = (sensorMask & (1 << 1)) !== 0;
    failures.ersLevel = (sensorMask & (1 << 2)) !== 0;
    failures.engineMap = (sensorMask & (1 << 3)) !== 0;
    failures.currentGear = (sensorMask & (1 << 4)) !== 0;
    failures.rpm = (sensorMask & (1 << 5)) !== 0;
    failures.velocity = (sensorMask & (1 << 6)) !== 0;
    failures.tires = (sensorMask & (1 << 7)) !== 0;
    failures.engineWear = (sensorMask & (1 << 8)) !== 0;
    failures.engineTemp = (sensorMask & (1 << 9)) !== 0;
    failures.brakes = (sensorMask & (1 << 10)) !== 0;
    failures.rubberMarbles = (sensorMask & (1 << 11)) !== 0;
    failures.misShift = (sensorMask & (1 << 12)) !== 0;
    offset += 6;
  }

  return result;
}

export function calculateTractiveForce(
  throttle: number,
  accelForce: number,
  misShift: boolean
): number {
  return misShift ? 0.0 : throttle * accelForce;
}

export function calculateTrailBrakingLoadTransfer(
  brake: number,
  baseGrip: number
): number {
  return baseGrip * (1.0 + brake * 0.25);
}

export function calculateGripSpeed(
  gripSpeed: number,
  grip: number
): number {
  return Math.max(0.1, gripSpeed * grip);
}

