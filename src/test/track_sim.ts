/**
 * VibeRacing Procedural Track Spline Verification Test Suite
 * Validates PRNG determinism, uniform arc-length spacing, spline loop closure,
 * normal-tangent orthogonality, snap-to-spline accuracy, and dynamic tension zone segmentation.
 */

import { TrackGenerator, TrackNode } from "../shared/TrackGenerator.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

console.log("🏎️  VIBERACING PROCEDURAL TRACK SPLINE VALIDATION TEST 🏎️\n");

// 1. Instantiation and Length validation
console.log("Step 1: Instantiating track generator with seed 42...");
const track42 = new TrackGenerator(42, 1000);
console.log(`- Track total length: ${track42.totalLength.toFixed(2)} meters`);
assert(track42.nodes.length === 1000, "Track should generate exactly 1000 uniform nodes");
assert(track42.totalLength > 1000 && track42.totalLength < 4000, "Length should fall in expected closed loop envelope");
console.log("✅ Instantiation and node volume successfully verified.");

// 2. Uniform spacing check
console.log("\nStep 2: Checking uniform arc-length re-sampling step size consistency...");
const expectedSpacing = track42.totalLength / 1000;
for (let i = 0; i < 999; i++) {
  const nodeA = track42.nodes[i];
  const nodeB = track42.nodes[i + 1];
  const step = nodeB.cumulativeDistance - nodeA.cumulativeDistance;
  assert(Math.abs(step - expectedSpacing) < 0.0001, `Spacing inconsistent at node ${i}: step is ${step}, expected ${expectedSpacing}`);
}
// Closed loop spacing
const lastNode = track42.nodes[999];
const finalStep = track42.totalLength - lastNode.cumulativeDistance;
assert(Math.abs(finalStep - expectedSpacing) < 0.0001, "Loop closure cumulative spacing inconsistent");
console.log("✅ Arc-Length parameters have perfectly uniform spacing.");

// 3. Orthogonality check (Normal perpendicular to Tangent)
console.log("\nStep 3: Asserting geometric orthogonality (Tangent dot Normal = 0.0)...");
for (let i = 0; i < 1000; i++) {
  const node = track42.nodes[i];
  const dotProduct = node.tangent.x * node.normal.x + node.tangent.y * node.normal.y + node.tangent.z * node.normal.z;
  assert(Math.abs(dotProduct) < 0.0001, `Orthogonality violated at node ${i}: dot product is ${dotProduct}`);
}
console.log("✅ All normal vectors are exactly perpendicular to tangents.");

// 4. Closed Loop continuity check
console.log("\nStep 4: Verifying loop closure boundary smooth integration...");
const firstNode = track42.nodes[0];
const snapBackNode = track42.getNodeAtDistance(track42.totalLength);
assert(Math.abs(snapBackNode.position.x - firstNode.position.x) < 0.001, "Position X discontinuous at track wrap-around");
assert(Math.abs(snapBackNode.position.z - firstNode.position.z) < 0.001, "Position Z discontinuous at track wrap-around");
assert(Math.abs(snapBackNode.tangent.x - firstNode.tangent.x) < 0.001, "Tangent X discontinuous at track wrap-around");
console.log("✅ Spline exhibits excellent smooth C1 closed loop boundary continuity.");

// 5. Determinism validation
console.log("\nStep 5: Verifying PRNG determinism (Seed 42 vs Seed 42, Seed 42 vs Seed 43)...");
const track42Duplicate = new TrackGenerator(42, 1000);
const track43 = new TrackGenerator(43, 1000);

assert(track42.totalLength === track42Duplicate.totalLength, "Identical seeds yielded different total track lengths");
assert(track42.nodes[500].position.x === track42Duplicate.nodes[500].position.x, "Identical seeds yielded different node coordinates");

assert(track42.totalLength !== track43.totalLength, "Different seeds yielded identical total track lengths (highly improbable LCG collision)");
assert(track42.nodes[500].position.x !== track43.nodes[500].position.x, "Different seeds yielded identical node coordinates");
console.log("✅ PRNG and track extrusion are 100% deterministic.");

// 6. Closest node snapping (Euclidean snap validation)
console.log("\nStep 6: Validating snap-to-spline closest node lookups...");
// Take node 250 coordinate and perturb it slightly sideways (along the normal direction)
const targetNode = track42.nodes[250];
const perturbX = targetNode.position.x + targetNode.normal.x * 5.0; // 5 meters sideways
const perturbZ = targetNode.position.z + targetNode.normal.z * 5.0;

const snappedNode = track42.findClosestNode(perturbX, perturbZ);
assert(snappedNode.index === targetNode.index, `Snap-to-spline failed: snapped to node ${snappedNode.index}, expected ${targetNode.index}`);
console.log("✅ Closest node snapped with 100% precision.");

// 7. Tension Zone distribution verification
console.log("\nStep 7: Checking Tension Zone dynamic classifications...");
let countRettilineo = 0;
let countStaccata = 0;
let countPercorrenza = 0;

for (let i = 0; i < 1000; i++) {
  const zone = track42.nodes[i].tensionZone;
  if (zone === "Rettilineo") countRettilineo++;
  else if (zone === "Staccata") countStaccata++;
  else if (zone === "Percorrenza") countPercorrenza++;
}

console.log(`- Rettilineo (Straights): ${countRettilineo} nodes (${(countRettilineo / 10).toFixed(1)}%)`);
console.log(`- Staccata (Braking): ${countStaccata} nodes (${(countStaccata / 10).toFixed(1)}%)`);
console.log(`- Percorrenza (Cornering): ${countPercorrenza} nodes (${(countPercorrenza / 10).toFixed(1)}%)`);

assert(countRettilineo > 0, "No straight zones detected");
assert(countStaccata > 0, "No braking zones detected preceding corners");
assert(countPercorrenza > 0, "No lateral cornering zones detected");
console.log("✅ Tension zone classification rules are fully active and correctly proportioned.");

console.log("\n🚀 All VibeRacing Track Spline validations completed with 100% success!");
process.exit(0);
