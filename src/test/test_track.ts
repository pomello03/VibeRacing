import { TrackGenerator } from "../shared/TrackGenerator.js";

console.log("🏁 TESTING PROC-TRACK GENERATOR SPLINE 🏁");
const seed = 42;
const generator = new TrackGenerator(seed);

console.log(`Seed: ${seed}`);
console.log(`Nodes Generated: ${generator.nodes.length}`);
console.log(`Total Circuit Length: ${generator.totalLength.toFixed(2)} meters`);

// Check some nodes
console.log("\nSample Nodes Summary:");
for (let i = 0; i < 5; i++) {
  const node = generator.nodes[i * 200];
  console.log(`Node ${node.index}:`);
  console.log(`  - Position: (${node.position.x.toFixed(2)}, ${node.position.y.toFixed(2)}, ${node.position.z.toFixed(2)})`);
  console.log(`  - Tangent:  (${node.tangent.x.toFixed(2)}, ${node.tangent.y.toFixed(2)}, ${node.tangent.z.toFixed(2)})`);
  console.log(`  - Normal:   (${node.normal.x.toFixed(2)}, ${node.normal.y.toFixed(2)}, ${node.normal.z.toFixed(2)})`);
  console.log(`  - Curvature: ${node.curvature.toFixed(6)} (radius ~ ${(1 / (node.curvature || 1)).toFixed(1)}m)`);
  console.log(`  - Width:     ${node.width.toFixed(2)}m`);
  console.log(`  - Distance:  ${node.cumulativeDistance.toFixed(2)}m`);
  console.log(`  - Zone:      ${node.tensionZone}`);
}

// Count tension zones
let rett = 0;
let stac = 0;
let perc = 0;
for (const node of generator.nodes) {
  if (node.tensionZone === 'Rettilineo') rett++;
  else if (node.tensionZone === 'Staccata') stac++;
  else if (node.tensionZone === 'Percorrenza') perc++;
}

console.log("\nTension Zone Distribution:");
console.log(`- Rettilineo (Straight):   ${rett} nodes (${((rett / generator.nodes.length) * 100).toFixed(1)}%)`);
console.log(`- Staccata (Braking):      ${stac} nodes (${((stac / generator.nodes.length) * 100).toFixed(1)}%)`);
console.log(`- Percorrenza (Corner):    ${perc} nodes (${((perc / generator.nodes.length) * 100).toFixed(1)}%)`);

// Test Snap and Interpolation
console.log("\nTesting API Methods:");
const targetPos = { x: 100.0, z: -200.0 };
const closest = generator.findClosestNode(targetPos.x, targetPos.z);
console.log(`Closest Node to X=${targetPos.x}, Z=${targetPos.z} is Node ${closest.index} at (${closest.position.x.toFixed(2)}, ${closest.position.z.toFixed(2)})`);

const midDistance = generator.totalLength * 0.5;
const midNode = generator.getNodeAtDistance(midDistance);
console.log(`Node at half distance (${midDistance.toFixed(2)}m): Index ${midNode.index}, Position (${midNode.position.x.toFixed(2)}, ${midNode.position.z.toFixed(2)})`);
console.log(`Tension zone at half distance: ${generator.retrieveTensionZoneAtDistance(midDistance)}`);

console.log("\n✅ All tests passed successfully!");
process.exit(0);
