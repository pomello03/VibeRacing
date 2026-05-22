import * as THREE from 'three';
import { TrackGenerator, TrackNode } from '../shared/TrackGenerator.js';
import { SharedGameState, calculateTractiveForce, calculateTrailBrakingLoadTransfer, calculateGripSpeed } from '../shared/GameState.js';
import { InputHandler } from './InputHandler.js';
import { updateVehicleAging } from '../shared/Progression.js';

export class HypercarRender {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer | null = null;
  public trackMesh: THREE.Mesh | null = null;
  public carMesh: THREE.Mesh | null = null;
  public racingLineMesh: THREE.LineLoop | null = null;

  // Camera smooth target tracking (Art of Rally follow style)
  private camSmoothPos = new THREE.Vector3();
  private camSmoothLookAt = new THREE.Vector3();
  private isCamInitialized: boolean = false;

  // Domain models
  public track: TrackGenerator;
  public state: SharedGameState;
  public inputHandler: InputHandler;

  // Car kinematics state
  public carPos: { x: number; z: number } = { x: 0.0, z: 0.0 };
  public yaw: number = 0.0;    // heading yaw in radians
  public velYaw: number = 0.0; // actual velocity heading yaw in radians (for drifting)
  public velocity: number = 0.0; // velocity magnitude in m/s

  // Weather configuration (Dynamic fog density: e.g. 0.005 for clear, 0.05 for heavy fog)
  public weatherFog: number = 0.005;

  // Standard constants
  private readonly maxSteeringSpeed: number = 1.6; // rad/s
  private readonly drag: number = 0.15;            // drag coefficient
  private readonly brakingForce: number = 25.0;    // m/s^2 deceleration
  private readonly gripSpeed: number = 10.0;       // responsiveness multiplier

  constructor(
    canvas: HTMLCanvasElement | null,
    track: TrackGenerator,
    state: SharedGameState,
    inputHandler: InputHandler
  ) {
    this.track = track;
    this.state = state;
    this.inputHandler = inputHandler;

    // Load initial states from kinematics
    let pos = this.state.kinematics?.position || { x: 0, y: 0, z: 0 };
    if (pos.x === 0 && pos.z === 0 && this.track.nodes.length > 0) {
      const startNode = this.track.nodes[0];
      pos = { x: startNode.position.x, y: startNode.position.y, z: startNode.position.z };
      this.yaw = Math.atan2(startNode.tangent.z, startNode.tangent.x);
      if (this.state.kinematics) {
        this.state.kinematics.position.x = pos.x;
        this.state.kinematics.position.y = pos.y;
        this.state.kinematics.position.z = pos.z;
        this.state.kinematics.heading = this.yaw;
      }
    } else {
      this.yaw = this.state.kinematics?.heading || 0.0;
    }
    this.carPos.x = pos.x;
    this.carPos.z = pos.z;
    this.velYaw = this.yaw;

    const velVec = this.state.kinematics?.velocity || { x: 0, y: 0, z: 0 };
    this.velocity = Math.sqrt(velVec.x * velVec.x + velVec.z * velVec.z);

    // Setup base three.js infrastructure
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b0f19'); // Deep cosmic indigo ambient base
    this.scene.fog = new THREE.FogExp2('#0b0f19', this.weatherFog);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);

    // Add high-end lighting to make materials pop (Art of Rally signature clean shadow look)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight.position.set(120, 200, 70);
    this.scene.add(dirLight);

    // Initialize WebGLRenderer if running in visual context
    if (canvas) {
      try {
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        const width = canvas.clientWidth || 800;
        const height = canvas.clientHeight || 600;
        this.renderer.setSize(width, height);
      } catch (err) {
        console.warn('WebGL failed to initialize, operating in headless mode.', err);
      }
    }

    // Extrude the track geometry procedurally
    this.buildTrackGeometry();

    // Create low-poly stylized vehicle
    this.buildVehicleMesh();
  }

  /**
   * Procedurally extrude the 1000 nodes of the track spline.
   */
  private buildTrackGeometry(): void {
    const numNodes = this.track.nodes.length;
    const geom = new THREE.BufferGeometry();

    // 1000 nodes -> 2000 vertices total (LeftEdge and RightEdge per node)
    const vertices = new Float32Array(numNodes * 2 * 3);

    for (let i = 0; i < numNodes; i++) {
      const node = this.track.nodes[i];
      const halfW = node.width / 2.0;

      // LeftEdge = node.position - (node.width / 2) * node.normal
      const lx = node.position.x - halfW * node.normal.x;
      const ly = node.position.y - halfW * node.normal.y;
      const lz = node.position.z - halfW * node.normal.z;

      // RightEdge = node.position + (node.width / 2) * node.normal
      const rx = node.position.x + halfW * node.normal.x;
      const ry = node.position.y + halfW * node.normal.y;
      const rz = node.position.z + halfW * node.normal.z;

      const idx = i * 6;
      // Vertices for node i
      vertices[idx] = lx;
      vertices[idx + 1] = ly;
      vertices[idx + 2] = lz;

      vertices[idx + 3] = rx;
      vertices[idx + 4] = ry;
      vertices[idx + 5] = rz;
    }

    // Build the face indexes (closed loop connecting i with (i+1)%1000)
    const indices: number[] = [];
    for (let i = 0; i < numNodes; i++) {
      const nextI = (i + 1) % numNodes;
      const v0 = 2 * i;
      const v1 = 2 * i + 1;
      const v2 = 2 * nextI;
      const v3 = 2 * nextI + 1;

      // Triangle 1 (v0, v1, v2)
      indices.push(v0, v1, v2);
      // Triangle 2 (v1, v3, v2)
      indices.push(v1, v3, v2);
    }

    geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    // Standard high-fidelity MeshStandardMaterial (charcoal surface color)
    const trackMaterial = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.8,
      metalness: 0.2,
      side: THREE.DoubleSide
    });

    this.trackMesh = new THREE.Mesh(geom, trackMaterial);
    this.scene.add(this.trackMesh);

    // Build procedural neon racing line along track center nodes
    const lineGeom = new THREE.BufferGeometry();
    const lineVertices = new Float32Array(numNodes * 3);
    for (let i = 0; i < numNodes; i++) {
      const p = this.track.nodes[i].position;
      lineVertices[i * 3] = p.x;
      lineVertices[i * 3 + 1] = p.y + 0.05; // slightly elevated above surface to prevent z-fighting
      lineVertices[i * 3 + 2] = p.z;
    }
    lineGeom.setAttribute('position', new THREE.BufferAttribute(lineVertices, 3));

    // Standard LineBasicMaterial that works perfectly on all WebGL drivers
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x10b981,
      linewidth: 3
    });

    this.racingLineMesh = new THREE.LineLoop(lineGeom, lineMaterial);
    this.scene.add(this.racingLineMesh);
  }

  /**
   * Build a procedural low-poly representation of the hypercar.
   */
  private buildVehicleMesh(): void {
    const geom = new THREE.BoxGeometry(1.8, 0.6, 3.8);

    // Standard high-fidelity MeshStandardMaterial (vivid crimson vehicle)
    const carMaterial = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.3,
      metalness: 0.8
    });

    this.carMesh = new THREE.Mesh(geom, carMaterial);
    this.scene.add(this.carMesh);

    // Position car mesh based on initial coords snapped to track elevation
    const closest = this.track.findClosestNode(this.carPos.x, this.carPos.z);
    this.carMesh.position.set(this.carPos.x, closest.position.y + 0.3, this.carPos.z);
    this.carMesh.rotation.y = -this.yaw;
  }

  // Removed custom shaders in favor of robust standard Three.js materials

  /**
   * Dynamic real-time physics tick integrating engine parameters and inputs.
   * Modulates values based on the SharedGameState metrics, wear, and environments.
   * @param dt Delta time in seconds
   */
  public update(dt: number = 0.016): void {
    if (this.state.pitStop?.active) {
      this.inputHandler.isLocked = true;
    }

    // 1. Gather active inputs from InputHandler
    this.inputHandler.update(dt);
    let steering = this.inputHandler.steering;
    let throttle = this.inputHandler.throttle;
    let brake = this.inputHandler.brake;

    if (this.state.pitStop?.active) {
      steering = 0.0;
      throttle = 0.0;
      brake = 1.0;
      this.velocity = 0.0;
    }

    // Apply rogue-lite vehicle aging and physical degradation
    updateVehicleAging(this.state, this.track, steering, throttle, brake, dt);


    // 2. Fetch parameters from state with fallback safety
    const syncStreak = this.state.metrics?.syncStreak ?? 0;
    const engineWear = this.state.wear?.engine?.wear ?? 0.0;
    const tireWearFL = this.state.wear?.tires?.frontLeft ?? 0.0;
    const marbles = this.state.environment?.rubberMarbles ?? 0.0;
    const misShift = !!this.state.environment?.sensorFailures?.misShift;

    // 3. Dynamic Modulations
    // Acceleration Force: Base = 15.0 m/s^2. Scaled by syncStreak, reduced by engine wear.
    const accelForce = 15.0 * (1.0 + syncStreak * 0.05) * (1.0 - engineWear * 0.4);

    // Lateral Grip: Base = 1.0. Reduced by tire wear, heavily degraded by rubber marbles.
    const baseGrip = 1.0 * (1.0 - tireWearFL * 0.25) * (1.0 - marbles * 0.8);
    const grip = calculateTrailBrakingLoadTransfer(brake, baseGrip);

    // 4. Integrate Yaw (Heading)
    this.yaw += steering * this.maxSteeringSpeed * dt;
    // Keep yaw normalized in [-PI, PI]
    this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));

    // 5. Integrate Velocity (Longitudinal speed along heading)
    const tractiveForce = calculateTractiveForce(throttle, accelForce, misShift);
    const dragForce = this.drag * this.velocity;
    this.velocity += (tractiveForce - brake * this.brakingForce - dragForce) * dt;

    // Guard against backward drifting or extreme speeds
    if (this.velocity < 0.0) {
      this.velocity = 0.0;
    }

    // 6. Sliding / Lateral Drift angle processing
    // Under low grip conditions, velYaw (velocity vector direction) lags behind heading (yaw)
    const currentGripSpeed = calculateGripSpeed(this.gripSpeed, grip);
    let diff = this.yaw - this.velYaw;
    // Normalize angular distance to [-PI, PI]
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.velYaw += diff * currentGripSpeed * dt;
    this.velYaw = Math.atan2(Math.sin(this.velYaw), Math.cos(this.velYaw));

    // 7. Track Position updates
    const prevVx = this.velocity * Math.cos(this.velYaw);
    const prevVz = this.velocity * Math.sin(this.velYaw);

    this.carPos.x += this.velocity * Math.cos(this.velYaw) * dt;
    this.carPos.z += this.velocity * Math.sin(this.velYaw) * dt;

    // Determine current elevation y from track surface spline nodes
    const snappedNode = this.track.findClosestNode(this.carPos.x, this.carPos.z);
    const yVal = snappedNode.position.y;

    // 8. Sync position/rotation to three.js scene graphics
    if (this.carMesh) {
      this.carMesh.position.set(this.carPos.x, yVal + 0.3, this.carPos.z);
      this.carMesh.rotation.y = -this.yaw;
    }

    // Dynamic weather fog density adjustment
    if (this.scene.fog && this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = this.weatherFog;
    }

    if (this.racingLineMesh) {
      const mat = this.racingLineMesh.material as THREE.LineBasicMaterial;
      // Dynamic visual racing line color changes by active track TensionZone
      let colorHex = 0x10b981; // Rettilineo (Straights) -> Emerald Green
      if (snappedNode.tensionZone === 'Staccata') {
        colorHex = 0xef4444; // Staccata (Braking) -> Racing Red
      } else if (snappedNode.tensionZone === 'Percorrenza') {
        colorHex = 0x3b82f6; // Percorrenza (Cornering) -> Electric Blue
      }
      mat.color.setHex(colorHex);
    }

    // --- Art of Rally Follow Camera Mechanic ---
    // Overhead follow camera with smooth lag (position & lookAt target) to prevent motion sickness and anticipate curves.
    const lookAheadDistance = this.velocity * 0.45 + 5.0; // look further ahead proportionally to speed
    const futureNodeIdx = (snappedNode.index + Math.round(lookAheadDistance)) % this.track.nodes.length;
    const futureNode = this.track.nodes[futureNodeIdx];
    const lookAtTarget = new THREE.Vector3(
      futureNode.position.x,
      yVal + 0.8,
      futureNode.position.z
    );

    const camDist = 14.5;
    const camHeight = 5.5; // elevated overhead for the iconic Art of Rally angle
    const targetCamX = this.carPos.x - camDist * Math.cos(this.yaw);
    const targetCamZ = this.carPos.z - camDist * Math.sin(this.yaw);
    const targetCamPos = new THREE.Vector3(targetCamX, yVal + camHeight, targetCamZ);

    if (!this.isCamInitialized) {
      this.camSmoothPos.copy(targetCamPos);
      this.camSmoothLookAt.copy(lookAtTarget);
      this.isCamInitialized = true;
    } else {
      const followLerpFactor = 1.0 - Math.exp(-5.0 * dt);
      const lookAtLerpFactor = 1.0 - Math.exp(-3.5 * dt);
      
      this.camSmoothPos.lerp(targetCamPos, followLerpFactor);
      this.camSmoothLookAt.lerp(lookAtTarget, lookAtLerpFactor);
    }

    this.camera.position.copy(this.camSmoothPos);

    if (misShift) {
      this.weatherFog = 0.05;
      const shakeStrength = 0.3;
      this.camera.position.x += (Math.random() - 0.5) * shakeStrength;
      this.camera.position.y += (Math.random() - 0.5) * shakeStrength;
      this.camera.position.z += (Math.random() - 0.5) * shakeStrength;
      
      const shakeTarget = this.camSmoothLookAt.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * shakeStrength,
        (Math.random() - 0.5) * shakeStrength,
        (Math.random() - 0.5) * shakeStrength
      ));
      this.camera.lookAt(shakeTarget);
    } else {
      this.weatherFog = 0.005;
      this.camera.lookAt(this.camSmoothLookAt);
    }

    // 9. Sync physical state back to SharedGameState parameters
    const vx = this.velocity * Math.cos(this.velYaw);
    const vz = this.velocity * Math.sin(this.velYaw);

    if (this.state.kinematics) {
      this.state.kinematics.position.x = this.carPos.x;
      this.state.kinematics.position.y = yVal;
      this.state.kinematics.position.z = this.carPos.z;

      this.state.kinematics.heading = this.yaw;

      this.state.kinematics.velocity.x = vx;
      this.state.kinematics.velocity.y = 0.0;
      this.state.kinematics.velocity.z = vz;

      // Numerical acceleration estimation
      this.state.kinematics.acceleration.x = (vx - prevVx) / dt;
      this.state.kinematics.acceleration.y = 0.0;
      this.state.kinematics.acceleration.z = (vz - prevVz) / dt;
    }

    // Update inputs synced back into the state telemetry
    if (this.state.telemetry) {
      this.state.telemetry.throttle = throttle;
      this.state.telemetry.brake = brake;
      // Synthesize rpm based on velocity and engine gears
      this.state.telemetry.rpm = 1000.0 + this.velocity * 300.0;
    }

    // Progress monotonic counters in sequence
    this.state.sequenceNumber += 1;
    this.state.timestamp += Math.round(dt * 1000.0);
  }

  /**
   * Renders the three.js WebGL scene if visual context is present.
   */
  public render(): void {
    if (this.renderer) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Cleans up WebGL resources to prevent memory leaks during "Stint Swap".
   */
  public dispose(): void {
    if (this.trackMesh) {
      if (this.trackMesh.geometry) {
        this.trackMesh.geometry.dispose();
      }
      if (this.trackMesh.material) {
        if (Array.isArray(this.trackMesh.material)) {
          this.trackMesh.material.forEach(m => m.dispose());
        } else {
          this.trackMesh.material.dispose();
        }
      }
      this.scene.remove(this.trackMesh);
      this.trackMesh = null;
    }

    if (this.racingLineMesh) {
      if (this.racingLineMesh.geometry) {
        this.racingLineMesh.geometry.dispose();
      }
      if (this.racingLineMesh.material) {
        if (Array.isArray(this.racingLineMesh.material)) {
          this.racingLineMesh.material.forEach(m => m.dispose());
        } else {
          this.racingLineMesh.material.dispose();
        }
      }
      this.scene.remove(this.racingLineMesh);
      this.racingLineMesh = null;
    }

    if (this.carMesh) {
      if (this.carMesh.geometry) {
        this.carMesh.geometry.dispose();
      }
      if (this.carMesh.material) {
        if (Array.isArray(this.carMesh.material)) {
          this.carMesh.material.forEach(m => m.dispose());
        } else {
          this.carMesh.material.dispose();
        }
      }
      this.scene.remove(this.carMesh);
      this.carMesh = null;
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }
}
