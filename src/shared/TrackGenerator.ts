/**
 * VibeRacing Procedural Track Generator
 * High-fidelity, deterministic procedural track generator spline architecture.
 * Complies with .agy/skills/physics-core.md and game engine design principles.
 * 
 * Mathematical Architecture:
 * 1. PRNG: Mulberry32 algorithm, a 32-bit state generator providing superior
 *    randomness distribution and speed compared to traditional LCGs, using an integer seed.
 * 2. Spline: Uniform Catmull-Rom spline with C1 continuity. Closed-loop behavior is enforced via
 *    modulo arithmetic over control points.
 * 3. Arc-Length Parameterization: Discretizes the Catmull-Rom spline at high-resolution (3200 samples),
 *    integrates distance along the chord lengths, and re-samples at a perfectly uniform step size (total length / numNodes)
 *    to ensure constant-speed traversal and accurate physical coordinates.
 * 4. Curvature (K): Computed analytically at every point using:
 *    K = ||P'(t) x P''(t)|| / ||P'(t)||^3
 * 5. Curvature Derivative (dK/ds): Computed numerically via central differences:
 *    dK/ds = (K_{i+1} - K_{i-1}) / (2 * delta_s)
 * 6. Normal Vector (Lateral Vector): Reconstructed via standard cross product T x Up (where Up = 0,1,0),
 *    projected on the horizontal ground plane and normalized.
 * 7. Tension Zone Classification:
 *    - 'Percorrenza' (Cornering): Local curvature K >= cornerThreshold (0.005, radius <= 200m).
 *    - 'Staccata' (Hard Braking): Curvature is transitioning from low to high (approaching corner).
 *      Identified via looking ahead a physical distance (default 80m). If the current curvature is low,
 *      but a node within the lookahead window exceeds the cornerThreshold, we classify it as 'Staccata'.
 *    - 'Rettilineo' (Straight): Curvature is low and no corner is approaching.
 * 
 * Coordinate System:
 * - X and Z represent the horizontal ground coordinates.
 * - Y represents the vertical height / elevation coordinate.
 * - Tangents and Normals are 3D unit vectors.
 */

export interface TrackNode {
  index: number;
  position: { x: number; y: number; z: number };
  tangent: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  curvature: number;
  curvatureDerivative: number;
  width: number;
  cumulativeDistance: number;
  tensionZone: 'Rettilineo' | 'Staccata' | 'Percorrenza';
}

/**
 * Deterministic 32-bit Pseudo-Random Number Generator (Mulberry32)
 */
export class Mulberry32 {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /**
   * Generates a pseudo-random floating point number in [0, 1)
   */
  public next(): number {
    let t = (this.state += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates a pseudo-random floating point number in [min, max)
   */
  public nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

export class TrackGenerator {
  public readonly seed: number;
  public readonly nodes: TrackNode[] = [];
  public readonly totalLength: number;

  constructor(seed: number, numNodes: number = 1000) {
    this.seed = seed;
    const prng = new Mulberry32(seed);

    // 1. Generate procedural control points in a closed circle
    const numCtrl = 16;
    const baseRadius = 400.0;
    
    const radii = new Float64Array(numCtrl);
    const heights = new Float64Array(numCtrl);
    const widths = new Float64Array(numCtrl);

    for (let i = 0; i < numCtrl; i++) {
      // Perturb base radius by up to +/- 150 meters
      radii[i] = baseRadius + prng.nextRange(-150.0, 150.0);
      // Elevate vertically to generate hills (up to +/- 30 meters)
      heights[i] = prng.nextRange(-30.0, 30.0);
      // Vary track width (10 to 16 meters)
      widths[i] = prng.nextRange(10.0, 16.0);
    }

    // Apply a smoothing pass to control points to avoid self-intersections or excessive kinks
    const smoothedRadii = new Float64Array(numCtrl);
    const smoothedHeights = new Float64Array(numCtrl);
    const smoothedWidths = new Float64Array(numCtrl);

    for (let i = 0; i < numCtrl; i++) {
      const prev = (i - 1 + numCtrl) % numCtrl;
      const next = (i + 1) % numCtrl;
      smoothedRadii[i] = 0.25 * radii[prev] + 0.5 * radii[i] + 0.25 * radii[next];
      smoothedHeights[i] = 0.25 * heights[prev] + 0.5 * heights[i] + 0.25 * heights[next];
      smoothedWidths[i] = 0.25 * widths[prev] + 0.5 * widths[i] + 0.25 * widths[next];
    }

    const ctrlPoints: Array<{ x: number; y: number; z: number; width: number }> = [];
    for (let i = 0; i < numCtrl; i++) {
      const angle = (2.0 * Math.PI * i) / numCtrl;
      ctrlPoints.push({
        x: smoothedRadii[i] * Math.cos(angle),
        y: smoothedHeights[i],
        z: smoothedRadii[i] * Math.sin(angle),
        width: smoothedWidths[i],
      });
    }

    // 2. High-resolution evaluation along the Catmull-Rom spline
    const samplesPerSegment = 200;
    const rawPoints: Array<{
      position: { x: number; y: number; z: number };
      tangent: { x: number; y: number; z: number };
      curvature: number;
      width: number;
    }> = [];

    for (let i = 0; i < numCtrl; i++) {
      const p0 = ctrlPoints[(i - 1 + numCtrl) % numCtrl];
      const p1 = ctrlPoints[i];
      const p2 = ctrlPoints[(i + 1) % numCtrl];
      const p3 = ctrlPoints[(i + 2) % numCtrl];

      for (let k = 0; k < samplesPerSegment; k++) {
        const t = k / samplesPerSegment;

        const x = TrackGenerator.interpolateCatmullRom(p0.x, p1.x, p2.x, p3.x, t);
        const y = TrackGenerator.interpolateCatmullRom(p0.y, p1.y, p2.y, p3.y, t);
        const z = TrackGenerator.interpolateCatmullRom(p0.z, p1.z, p2.z, p3.z, t);

        const dx = TrackGenerator.derivativeCatmullRom(p0.x, p1.x, p2.x, p3.x, t);
        const dy = TrackGenerator.derivativeCatmullRom(p0.y, p1.y, p2.y, p3.y, t);
        const dz = TrackGenerator.derivativeCatmullRom(p0.z, p1.z, p2.z, p3.z, t);

        const ddx = TrackGenerator.secondDerivativeCatmullRom(p0.x, p1.x, p2.x, p3.x, t);
        const ddy = TrackGenerator.secondDerivativeCatmullRom(p0.y, p1.y, p2.y, p3.y, t);
        const ddz = TrackGenerator.secondDerivativeCatmullRom(p0.z, p1.z, p2.z, p3.z, t);

        const w = TrackGenerator.interpolateCatmullRom(p0.width, p1.width, p2.width, p3.width, t);

        const vLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const tangent = {
          x: dx / (vLen || 1),
          y: dy / (vLen || 1),
          z: dz / (vLen || 1),
        };

        // Curvature calculation via K = ||P' x P''|| / ||P'||^3
        const cx = dy * ddz - dz * ddy;
        const cy = dz * ddx - dx * ddz;
        const cz = dx * ddy - dy * ddx;
        const crossLen = Math.sqrt(cx * cx + cy * cy + cz * cz);
        const curvature = crossLen / (vLen * vLen * vLen || 1);

        rawPoints.push({
          position: { x, y, z },
          tangent,
          curvature,
          width: w,
        });
      }
    }

    // 3. Integrate cumulative distances for raw samples
    const numRaw = rawPoints.length;
    const rawDistances = new Float64Array(numRaw + 1);
    rawDistances[0] = 0;

    for (let j = 1; j < numRaw; j++) {
      const pA = rawPoints[j - 1].position;
      const pB = rawPoints[j].position;
      const dx = pB.x - pA.x;
      const dy = pB.y - pA.y;
      const dz = pB.z - pA.z;
      rawDistances[j] = rawDistances[j - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    // Connect closed-loop boundary
    const pLast = rawPoints[numRaw - 1].position;
    const pFirst = rawPoints[0].position;
    const dxClose = pFirst.x - pLast.x;
    const dyClose = pFirst.y - pLast.y;
    const dzClose = pFirst.z - pLast.z;
    rawDistances[numRaw] = rawDistances[numRaw - 1] + Math.sqrt(dxClose * dxClose + dyClose * dyClose + dzClose * dzClose);

    this.totalLength = rawDistances[numRaw];

    // 4. Arc-Length parameterization to re-sample at perfectly uniform distance steps
    const spacing = this.totalLength / numNodes;
    let rawPtr = 0;

    for (let i = 0; i < numNodes; i++) {
      const targetS = i * spacing;

      // Scan rawPoints to locate interval containing targetS
      while (rawPtr < numRaw && rawDistances[rawPtr + 1] < targetS) {
        rawPtr++;
      }

      const j = rawPtr;
      const jNext = (j + 1) % numRaw;
      const distA = rawDistances[j];
      const distB = rawDistances[j + 1];

      let u = 0;
      if (distB > distA) {
        u = (targetS - distA) / (distB - distA);
      }

      const pA = rawPoints[j];
      const pB = rawPoints[jNext];

      const posX = pA.position.x + u * (pB.position.x - pA.position.x);
      const posY = pA.position.y + u * (pB.position.y - pA.position.y);
      const posZ = pA.position.z + u * (pB.position.z - pA.position.z);

      const tangX = pA.tangent.x + u * (pB.tangent.x - pA.tangent.x);
      const tangY = pA.tangent.y + u * (pB.tangent.y - pA.tangent.y);
      const tangZ = pA.tangent.z + u * (pB.tangent.z - pA.tangent.z);
      const tLen = Math.sqrt(tangX * tangX + tangY * tangY + tangZ * tangZ);
      const tangent = {
        x: tangX / (tLen || 1),
        y: tangY / (tLen || 1),
        z: tangZ / (tLen || 1),
      };

      const curvature = pA.curvature + u * (pB.curvature - pA.curvature);
      const width = pA.width + u * (pB.width - pA.width);

      // Reconstruct lateral normal vector pointing perpendicular to track direction (track right vector)
      // Normal = T x Up, where Up is vertical (0, 1, 0)
      const normX = -tangent.z;
      const normY = 0;
      const normZ = tangent.x;
      const nLen = Math.sqrt(normX * normX + normZ * normZ);
      const normal = {
        x: normX / (nLen || 1),
        y: normY,
        z: normZ / (nLen || 1),
      };

      this.nodes.push({
        index: i,
        position: {
          x: parseFloat(posX.toFixed(6)),
          y: parseFloat(posY.toFixed(6)),
          z: parseFloat(posZ.toFixed(6))
        },
        tangent: {
          x: parseFloat(tangent.x.toFixed(6)),
          y: parseFloat(tangent.y.toFixed(6)),
          z: parseFloat(tangent.z.toFixed(6))
        },
        normal: {
          x: parseFloat(normal.x.toFixed(6)),
          y: parseFloat(normal.y.toFixed(6)),
          z: parseFloat(normal.z.toFixed(6))
        },
        curvature: parseFloat(curvature.toFixed(6)),
        curvatureDerivative: 0, // Assigned below
        width: parseFloat(width.toFixed(6)),
        cumulativeDistance: parseFloat(targetS.toFixed(6)),
        tensionZone: 'Rettilineo', // Classified below
      });
    }

    // 5. Curvature Smoothing and Derivative (dK/ds) calculation
    const smoothedCurvatures = new Float64Array(numNodes);
    const smoothWindow = 8; // Window size for moving average to avoid control point transition jumps

    for (let i = 0; i < numNodes; i++) {
      let sum = 0;
      for (let w = -smoothWindow; w <= smoothWindow; w++) {
        const idx = (i + w + numNodes) % numNodes;
        sum += this.nodes[idx].curvature;
      }
      smoothedCurvatures[i] = sum / (2 * smoothWindow + 1);
    }

    // Assign smoothed curvature and calculate central difference derivative
    for (let i = 0; i < numNodes; i++) {
      this.nodes[i].curvature = parseFloat(smoothedCurvatures[i].toFixed(6));
    }

    for (let i = 0; i < numNodes; i++) {
      const prevIdx = (i - 1 + numNodes) % numNodes;
      const nextIdx = (i + 1) % numNodes;
      const cd = (this.nodes[nextIdx].curvature - this.nodes[prevIdx].curvature) / (2.0 * spacing);
      this.nodes[i].curvatureDerivative = parseFloat(cd.toFixed(6));
    }

    // 6. Dynamic Tension Zone Classification
    const cornerThreshold = 0.005; // ~200m radius threshold for cornering
    const lookaheadDistance = 80.0; // 80m braking distance lookahead

    for (let i = 0; i < numNodes; i++) {
      const currentCurvature = this.nodes[i].curvature;

      if (currentCurvature >= cornerThreshold) {
        this.nodes[i].tensionZone = 'Percorrenza';
      } else {
        // Look ahead to check if a sharp corner is upcoming (Hard Braking Zone detection)
        let isCornerApproaching = false;
        let distScanned = 0;
        let step = 1;

        while (distScanned < lookaheadDistance) {
          const nextIdx = (i + step) % numNodes;
          distScanned = step * spacing;

          if (this.nodes[nextIdx].curvature >= cornerThreshold) {
            isCornerApproaching = true;
            break;
          }
          step++;
        }

        if (isCornerApproaching) {
          this.nodes[i].tensionZone = 'Staccata';
        } else {
          this.nodes[i].tensionZone = 'Rettilineo';
        }
      }
    }
  }

  /**
   * Catmull-Rom Spline Interpolation Formula
   */
  private static interpolateCatmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
    return 0.5 * (
      (2.0 * p1) +
      (-p0 + p2) * t +
      (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t * t +
      (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t * t * t
    );
  }

  /**
   * Catmull-Rom Spline First Derivative
   */
  private static derivativeCatmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
    return 0.5 * (
      (-p0 + p2) +
      2.0 * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t +
      3.0 * (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t * t
    );
  }

  /**
   * Catmull-Rom Spline Second Derivative
   */
  private static secondDerivativeCatmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
    return (
      (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) +
      3.0 * (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t
    );
  }

  /**
   * Snaps coordinates (x, z) to the closest node along the track circuit.
   * Leverages horizontal ground-plane Euclidean distance checks.
   */
  public findClosestNode(x: number, z: number): TrackNode {
    let minD2 = Infinity;
    let closestNode = this.nodes[0];

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const dx = node.position.x - x;
      const dz = node.position.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD2) {
        minD2 = d2;
        closestNode = node;
      }
    }
    return closestNode;
  }

  /**
   * Linearly and spherically interpolates between two TrackNode structures.
   * Handles loop-closure wrap-around boundary check for cumulative distance correctly.
   */
  public interpolateBetween(nodeA: TrackNode, nodeB: TrackNode, t: number): TrackNode {
    // Clamp weight t
    t = Math.max(0, Math.min(1, t));

    // Position interpolation
    const posX = nodeA.position.x + t * (nodeB.position.x - nodeA.position.x);
    const posY = nodeA.position.y + t * (nodeB.position.y - nodeA.position.y);
    const posZ = nodeA.position.z + t * (nodeB.position.z - nodeA.position.z);

    // Tangent spherical/linear normalized interpolation
    const tangX = nodeA.tangent.x + t * (nodeB.tangent.x - nodeA.tangent.x);
    const tangY = nodeA.tangent.y + t * (nodeB.tangent.y - nodeA.tangent.y);
    const tangZ = nodeA.tangent.z + t * (nodeB.tangent.z - nodeA.tangent.z);
    const tLen = Math.sqrt(tangX * tangX + tangY * tangY + tangZ * tangZ);
    const tangent = {
      x: tangX / (tLen || 1),
      y: tangY / (tLen || 1),
      z: tangZ / (tLen || 1),
    };

    // Normal linear normalized interpolation
    const normX = nodeA.normal.x + t * (nodeB.normal.x - nodeA.normal.x);
    const normY = nodeA.normal.y + t * (nodeB.normal.y - nodeA.normal.y);
    const normZ = nodeA.normal.z + t * (nodeB.normal.z - nodeA.normal.z);
    const nLen = Math.sqrt(normX * normX + normY * normY + normZ * normZ);
    const normal = {
      x: normX / (nLen || 1),
      y: normY / (nLen || 1),
      z: normZ / (nLen || 1),
    };

    // Scalars
    const curvature = nodeA.curvature + t * (nodeB.curvature - nodeA.curvature);
    const curvatureDerivative = nodeA.curvatureDerivative + t * (nodeB.curvatureDerivative - nodeA.curvatureDerivative);
    const width = nodeA.width + t * (nodeB.width - nodeA.width);

    // Cumulative Distance with wrap-around
    let distB = nodeB.cumulativeDistance;
    if (nodeA.index > nodeB.index && nodeA.cumulativeDistance > distB) {
      distB += this.totalLength;
    }
    let cumulativeDistance = nodeA.cumulativeDistance + t * (distB - nodeA.cumulativeDistance);
    if (cumulativeDistance >= this.totalLength) {
      cumulativeDistance -= this.totalLength;
    }

    // Tension zone
    const tensionZone = t < 0.5 ? nodeA.tensionZone : nodeB.tensionZone;

    return {
      index: t < 0.5 ? nodeA.index : nodeB.index,
      position: { x: posX, y: posY, z: posZ },
      tangent,
      normal,
      curvature,
      curvatureDerivative,
      width,
      cumulativeDistance,
      tensionZone,
    };
  }

  /**
   * Retrieves the tension zone ('Rettilineo' | 'Staccata' | 'Percorrenza') at a given cumulative distance.
   */
  public retrieveTensionZoneAtDistance(distance: number): 'Rettilineo' | 'Staccata' | 'Percorrenza' {
    return this.getNodeAtDistance(distance).tensionZone;
  }

  /**
   * Retrieves an interpolated TrackNode structure at any cumulative distance along the circuit (O(1) complexity).
   */
  public getNodeAtDistance(distance: number): TrackNode {
    const L = this.totalLength;
    // Map distance to [0, L)
    const s = ((distance % L) + L) % L;

    const numNodes = this.nodes.length;
    const spacing = L / numNodes;

    const floatIdx = s / spacing;
    const idxA = Math.floor(floatIdx) % numNodes;
    const idxB = (idxA + 1) % numNodes;
    const t = floatIdx - Math.floor(floatIdx);

    return this.interpolateBetween(this.nodes[idxA], this.nodes[idxB], t);
  }
}
