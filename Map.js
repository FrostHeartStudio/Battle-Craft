
import * as THREE from
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export const MAP_SIZE = 240;

export const BLUE_SPAWNS = [
  [-100, 0, -90],
  [-110, 0, -80],
  [-90, 0, -100],
  [-100, 0, -110],
  [-80, 0, -90]
];

export const RED_SPAWNS = [
  [100, 0, 90],
  [110, 0, 80],
  [90, 0, 100],
  [100, 0, 110],
  [80, 0, 90]
];

export const obstacles = [];

const colliders = [];

function addCollider(x, z, w, d) {
  colliders.push({ x, z, w, d });
}

function createBox(scene, x, y, z, w, h, d, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85
    })
  );

  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.isMapObject = true;
  scene.add(mesh);

  return mesh;
}

export function createMap(scene, variant = 'city') {
  for (const obj of [...scene.children]) if (obj.userData?.isMapObject) { scene.remove(obj); obj.geometry?.dispose(); }
  obstacles.length = 0;
  colliders.length = 0;

  // TANAH
  const groundColor = variant === 'forest' ? 0x244a2b : variant === 'desert' ? 0xd4ad69 : 0x555f68;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE),
    new THREE.MeshStandardMaterial({
      color: groundColor,
      roughness: 1
    })
  );

  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  ground.receiveShadow = true; ground.userData.isMapObject = true;
  scene.add(ground);

  // JALAN UTAMA
  createBox(
    scene, 0, 0.02, 0,
    22, 0.04, MAP_SIZE,
    0x33383d
  );

  createBox(
    scene, 0, 0.025, 0,
    MAP_SIZE, 0.04, 22,
    0x33383d
  );

  // GARIS JALAN
  for (let i = -100; i <= 100; i += 20) {
    createBox(scene, 0, 0.06, i, 0.5, 0.02, 8, 0xe5d58a);
    createBox(scene, i, 0.06, 0, 8, 0.02, 0.5, 0xe5d58a);
  }

  // AREA SPAWN
  createBox(scene, -100, 0.04, -100, 35, 0.08, 35, 0x263d78);
  createBox(scene, 100, 0.04, 100, 35, 0.08, 35, 0x782c2c);

  // BANGUNAN
  // Layout unik per arena: bukan sekadar mengganti nama/warna map.
  const buildings = variant === 'forest' ? [
    [-82,-62,13,17,0x526c4b],[-48,-88,16,12,0x627b52],[42,-82,12,18,0x4e6948],[83,-48,17,13,0x61774d],
    [-88,8,18,12,0x526c4b],[-45,38,13,17,0x61774d],[5,78,18,12,0x4e6948],[62,52,13,18,0x526c4b],
    [88,5,17,12,0x627b52],[-8,-35,12,17,0x4e6948],[35,12,17,12,0x61774d],[-28,92,16,12,0x526c4b]
  ] : variant === 'desert' ? [
    [-75,-75,24,12,0xb89a69],[-32,-92,12,24,0xc4a879],[55,-75,26,13,0xa98a5d],[88,-35,14,25,0xc4a879],
    [-85,22,25,14,0xb89a69],[-45,58,14,26,0xc4a879],[5,82,26,14,0xa98a5d],[65,55,24,12,0xb89a69],
    [82,12,12,24,0xc4a879],[-8,-38,22,12,0xa98a5d],[35,2,12,22,0xb89a69],[-30,92,22,12,0xc4a879]
  ] : [
    [-60,-70,18,16,0x858b91],[-30,-80,14,20,0x8b735c],[60,-70,20,16,0x727b86],[30,-80,18,18,0x9a8066],
    [-70,-30,20,18,0x8a9299],[70,-30,18,20,0x8d7563],[-60,60,18,18,0x858b91],[-30,70,20,16,0x9a8066],
    [60,60,20,18,0x727b86],[30,70,18,20,0x8b735c],[-70,30,16,20,0x8a9299],[70,30,20,16,0x8d7563]
  ];

  for (const [x, z, w, d, color] of buildings) {
    const h = 8 + Math.random() * 5;

    const building = createBox(
      scene, x, h / 2, z,
      w, h, d, color
    );

    obstacles.push(building);
    addCollider(x, z, w, d);

    // ATAP
    createBox(
      scene, x, h + 0.3, z,
      w + 1, 0.6, d + 1,
      0x41464d
    );

    // JENDELA SEDERHANA
    for (let side = -1; side <= 1; side += 2) {
      createBox(
        scene,
        x + side * (w / 2 + 0.03),
        h * 0.55,
        z,
        0.08, 1.8, 3,
        0x42657c
      );
    }
  }

  // TEMBOK PERLINDUNGAN
  const walls = [
    [-15, -55, 18, 3],
    [15, -55, 18, 3],
    [-15, 55, 18, 3],
    [15, 55, 18, 3],

    [-55, -15, 3, 18],
    [-55, 15, 3, 18],
    [55, -15, 3, 18],
    [55, 15, 3, 18]
  ];

  for (const [x, z, w, d] of walls) {
    createBox(scene, x, 2, z, w, 4, d, 0x777d82);
    addCollider(x, z, w, d);
  }

  // POHON
  const treePositions = [];

  const treeCount = variant === 'forest' ? 125 : variant === 'desert' ? 12 : 65;
  for (let i = 0; i < treeCount; i++) {
    let x, z;

    do {
      x = Math.random() * 220 - 110;
      z = Math.random() * 220 - 110;
    } while (
      Math.abs(x) < 18 ||
      Math.abs(z) < 18
    );

    treePositions.push([x, z]);
  }

  for (const [x, z] of treePositions) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.7, 4, 8),
      new THREE.MeshStandardMaterial({
        color: variant === 'desert' ? 0x8d6842 : 0x59402a
      })
    );

    trunk.position.set(x, 2, z);
    trunk.castShadow = true; trunk.userData.isMapObject = true;
    scene.add(trunk);

    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 8, 8),
      new THREE.MeshStandardMaterial({
        color: variant === 'forest' ? 0x1d6b2c : variant === 'desert' ? 0x66794b : 0x315b30
      })
    );

    leaves.position.set(x, 5, z);
    leaves.castShadow = true; leaves.userData.isMapObject = true;
    scene.add(leaves);

    addCollider(x, z, 1.5, 1.5);
  }

  // BATU
  for (let i = 0; i < 35; i++) {
    const x = Math.random() * 200 - 100;
    const z = Math.random() * 200 - 100;

    if (Math.abs(x) < 15 || Math.abs(z) < 15) continue;

    const rock = createBox(
      scene,
      x, 0.8, z,
      2 + Math.random() * 3,
      1.5,
      2 + Math.random() * 3,
      variant === 'desert' ? 0x9a8665 : variant === 'forest' ? 0x555e50 : 0x686b68
    );

    obstacles.push(rock);
    addCollider(x, z, rock.geometry.parameters.width, rock.geometry.parameters.depth);
  }

  // BATAS MAP
  createBox(scene, 0, 4, -120, 240, 8, 2, 0x33383d);
  createBox(scene, 0, 4, 120, 240, 8, 2, 0x33383d);
  createBox(scene, -120, 4, 0, 2, 8, 240, 0x33383d);
  createBox(scene, 120, 4, 0, 2, 8, 240, 0x33383d);

  // LAMPU
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.userData.isMapObject = true;
  sun.position.set(-50, 100, 50);
  sun.castShadow = true;

  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -130;
  sun.shadow.camera.right = 130;
  sun.shadow.camera.top = 130;
  sun.shadow.camera.bottom = -130;

  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0xbad7ff, variant === 'desert' ? 0x80643b : 0x46502d, 1.2); hemi.userData.isMapObject = true; scene.add(hemi);
}

// COLLISION PLAYER
export function checkCollision(x, z, radius = 1) {
  for (const c of colliders) {
    const closestX = Math.max(
      c.x - c.w / 2,
      Math.min(x, c.x + c.w / 2)
    );

    const closestZ = Math.max(
      c.z - c.d / 2,
      Math.min(z, c.z + c.d / 2)
    );

    const dx = x - closestX;
    const dz = z - closestZ;

    if (dx * dx + dz * dz < radius * radius) {
      return true;
    }
  }

  return false;
}

// Raycast sederhana untuk memastikan tembakan tidak menembus bangunan/rintangan.
export function hasLineOfSight(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 0.01) return true;
  const steps = Math.ceil(distance / 0.45);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (checkCollision(from.x + dx*t, from.z + dz*t, 0.18)) {
      // obstacle collision is evaluated at ray height too; ground-level rocks/buildings block.
      const y = from.y + dy*t;
      if (y < 12) return false;
    }
  }
  return true;
}

export function canMoveTo(x, z, radius = 0.8) { return !checkCollision(x, z, radius); }
