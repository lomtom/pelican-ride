import * as THREE from 'three';

const $ = (selector) => document.querySelector(selector);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const sceneHost = $('#scene');
const ui = {
  loading: $('#loading'), intro: $('#intro'), speed: $('#speed'), distance: $('#distance'), fish: $('#fish-count'),
  mode: $('#ride-mode'), clock: $('#clock'), period: $('#period-label'), cycle: $('#cycle-progress'),
  marker: $('#cycle-marker'), auto: $('#autopilot-notice'), combo: $('#combo'), comboCount: $('#combo-count'),
  comboBar: $('#combo-bar'), cameraName: $('#camera-name'), cameraIndex: $('#camera-index'), cameraNumber: $('#camera-number'),
  quality: $('#quality-label'), fps: $('#fps-label'), achievementCount: $('#achievement-count'),
  achievementList: $('#achievement-list'), catchLabel: $('#catch-label')
};

const state = {
  started: false, speed: 5, distance: 0, fish: 0, x: 0, lane: 0, jumpY: 0, velocityY: 0,
  grounded: true, wheelie: 0, lean: 0, dayTime: 0.29, daylight: 1, elapsed: 0, lastInput: 0,
  autopilot: false, autoLaneAt: 0, autoJumpAt: 0, autoWheelieUntil: 0, combo: 0, comboLeft: 0,
  maxCombo: 0, jumps: 0, airTime: 0, wheelieTime: 0, wheelieBest: 0, laneChanges: 0,
  nightTime: 0, autoTime: 0, dayCycles: 0, maxSpeed: 0, camera: 0, cameraModes: new Set(),
  quality: 2, autoQuality: true, muted: true, caughtTimer: 0, landingSquash: 0
};
const keys = { accelerate: false, brake: false, wheelie: false };
const lanes = [-2.35, 0, 2.35];
const cameraNames = ['海岸追随', '浪花侧拍', '骑手视角', '高空俯瞰', '电影巡航'];

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sceneHost.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#83cbd0');
scene.fog = new THREE.FogExp2('#83cbd0', 0.0062);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 650);
camera.position.set(6, 4.6, 9);

const hemi = new THREE.HemisphereLight('#d9f4ee', '#a77a4d', 1.15);
scene.add(hemi);
const sunlight = new THREE.DirectionalLight('#ffe0ae', 2.25);
sunlight.position.set(-18, 28, 12);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(1536, 1536);
sunlight.shadow.camera.left = -18;
sunlight.shadow.camera.right = 18;
sunlight.shadow.camera.top = 18;
sunlight.shadow.camera.bottom = -18;
sunlight.shadow.camera.near = 1;
sunlight.shadow.camera.far = 80;
sunlight.shadow.bias = -0.0005;
scene.add(sunlight);

const materials = {
  white: new THREE.MeshStandardMaterial({ color: '#fff8e8', roughness: 0.82 }),
  featherShade: new THREE.MeshStandardMaterial({ color: '#e7e5d9', roughness: 0.9 }),
  orange: new THREE.MeshStandardMaterial({ color: '#f6a33c', roughness: 0.7 }),
  beak: new THREE.MeshStandardMaterial({ color: '#ffb84d', roughness: 0.62 }),
  dark: new THREE.MeshStandardMaterial({ color: '#142f35', roughness: 0.48 }),
  rubber: new THREE.MeshStandardMaterial({ color: '#17292b', roughness: 0.95 }),
  metal: new THREE.MeshStandardMaterial({ color: '#d5ddd5', roughness: 0.32, metalness: 0.65 }),
  coral: new THREE.MeshStandardMaterial({ color: '#ef6a50', roughness: 0.55 }),
  helmet: new THREE.MeshStandardMaterial({ color: '#ffc857', roughness: 0.38 }),
  lens: new THREE.MeshStandardMaterial({ color: '#102b35', roughness: 0.12, metalness: 0.65 }),
  scarf: new THREE.MeshStandardMaterial({ color: '#d94a3d', roughness: 0.88, side: THREE.DoubleSide }),
  wood: new THREE.MeshStandardMaterial({ color: '#7f5a3d', roughness: 1 }),
  leaf: new THREE.MeshStandardMaterial({ color: '#327c67', roughness: 0.92, side: THREE.DoubleSide })
};

function addMesh(geometry, material, parent, position = [0, 0, 0], scale = [1, 1, 1]) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position);
  object.scale.set(...scale);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function tubeBetween(a, b, radius, material, parent, radialSegments = 8) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const delta = end.clone().sub(start);
  const object = addMesh(new THREE.CylinderGeometry(radius, radius, delta.length(), radialSegments), material, parent);
  object.position.copy(start.add(end).multiplyScalar(0.5));
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return object;
}

function makeGlow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,244,190,1)');
  gradient.addColorStop(.16, 'rgba(255,207,105,.75)');
  gradient.addColorStop(.45, 'rgba(255,190,90,.18)');
  gradient.addColorStop(1, 'rgba(255,180,80,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

const celestial = new THREE.Group();
scene.add(celestial);
const sun = addMesh(new THREE.SphereGeometry(5, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffe4a0' }), celestial);
const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlow(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
sunGlow.scale.set(48, 48, 1);
sun.add(sunGlow);
const moon = addMesh(new THREE.SphereGeometry(3.2, 20, 14), new THREE.MeshBasicMaterial({ color: '#dbe7df' }), celestial);
const starPositions = new Float32Array(650 * 3);
for (let i = 0; i < 650; i++) {
  starPositions[i * 3] = (Math.random() - .5) * 430;
  starPositions[i * 3 + 1] = 18 + Math.random() * 150;
  starPositions[i * 3 + 2] = -45 - Math.random() * 310;
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({ color: '#fff4d6', size: .55, transparent: true, opacity: 0, depthWrite: false });
celestial.add(new THREE.Points(starGeometry, starMaterial));

const roadMaterial = new THREE.MeshStandardMaterial({ color: '#b9b397', roughness: .96 });
const sandMaterial = new THREE.MeshStandardMaterial({ color: '#d9bd87', roughness: 1 });
const grassMaterial = new THREE.MeshStandardMaterial({ color: '#80976c', roughness: 1 });
const road = addMesh(new THREE.PlaneGeometry(9, 500), roadMaterial, scene, [0, 0, -205]);
road.rotation.x = -Math.PI / 2;
road.castShadow = false;
const beach = addMesh(new THREE.PlaneGeometry(4, 500), sandMaterial, scene, [-6.5, -.09, -205]);
beach.rotation.x = -Math.PI / 2;
beach.castShadow = false;
const inland = addMesh(new THREE.PlaneGeometry(75, 500), grassMaterial, scene, [41.8, -.12, -205]);
inland.rotation.x = -Math.PI / 2;
inland.castShadow = false;

const edgeMaterial = new THREE.MeshBasicMaterial({ color: '#f5edcf' });
for (const x of [-4.12, 4.12]) {
  const edge = addMesh(new THREE.PlaneGeometry(.09, 500), edgeMaterial, scene, [x, .012, -205]);
  edge.rotation.x = -Math.PI / 2;
  edge.castShadow = false;
}

const movers = [];
function registerMover(object, range = 400, maxZ = 30, factor = 1) {
  movers.push({ object, range, maxZ, factor });
}
const dashMaterial = new THREE.MeshBasicMaterial({ color: '#eee7cb' });
for (let i = 0; i < 47; i++) {
  for (const x of [-1.18, 1.18]) {
    const dash = addMesh(new THREE.PlaneGeometry(.07, 2.3), dashMaterial, scene, [x, .018, 24 - i * 8]);
    dash.rotation.x = -Math.PI / 2;
    dash.castShadow = false;
    registerMover(dash, 376, 30);
  }
}
for (let i = 0; i < 40; i++) {
  const post = new THREE.Group();
  post.position.set(-4.75, 0, 25 - i * 9);
  tubeBetween([0, 0, 0], [0, .75, 0], .055, materials.wood, post, 6);
  tubeBetween([0, .56, -4.5], [0, .56, 4.5], .035, materials.wood, post, 6);
  scene.add(post);
  registerMover(post, 360, 34);
}

const oceanMaterial = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uDay: { value: 1 }, uQuality: { value: 2 } },
  vertexShader: `
    uniform float uTime;
    uniform float uQuality;
    varying vec2 vUv;
    varying float vWave;
    void main() {
      vUv = uv;
      vec3 p = position;
      float detail = mix(0.35, 1.0, uQuality * 0.5);
      float a = sin(p.x * 0.22 + uTime * 1.2) * 0.20;
      float b = sin(p.y * 0.15 - uTime * 1.45 + p.x * 0.08) * 0.28;
      float c = sin((p.x + p.y) * 0.48 + uTime * 1.8) * 0.07 * detail;
      p.z += a + b + c;
      vWave = a + b + c;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uDay;
    varying vec2 vUv;
    varying float vWave;
    void main() {
      vec3 deepNight = vec3(0.018, 0.09, 0.16);
      vec3 shallowNight = vec3(0.04, 0.20, 0.25);
      vec3 deepDay = vec3(0.025, 0.32, 0.43);
      vec3 shallowDay = vec3(0.18, 0.65, 0.64);
      vec3 deep = mix(deepNight, deepDay, uDay);
      vec3 shallow = mix(shallowNight, shallowDay, uDay);
      vec3 color = mix(deep, shallow, pow(vUv.x, 2.2));
      float ripple = smoothstep(0.26, 0.48, vWave) * 0.24;
      float shore = smoothstep(0.82, 0.98, vUv.x) * smoothstep(0.45, 0.9, sin(vUv.y * 190.0 - uTime * 3.0) * 0.5 + 0.5);
      color += (ripple + shore * 0.22) * mix(vec3(0.35, 0.48, 0.6), vec3(0.75, 0.95, 0.87), uDay);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
  side: THREE.DoubleSide
});
const ocean = new THREE.Mesh(new THREE.PlaneGeometry(100, 550, 70, 130), oceanMaterial);
ocean.rotation.x = -Math.PI / 2;
ocean.position.set(-54.4, -.4, -215);
scene.add(ocean);

const foamCount = 360;
const foamPositions = new Float32Array(foamCount * 3);
for (let i = 0; i < foamCount; i++) {
  foamPositions[i * 3] = -4.9 - Math.random() * 2.3;
  foamPositions[i * 3 + 1] = -.12 + Math.random() * .22;
  foamPositions[i * 3 + 2] = 30 - Math.random() * 390;
}
const foamGeometry = new THREE.BufferGeometry();
foamGeometry.setAttribute('position', new THREE.BufferAttribute(foamPositions, 3));
const foam = new THREE.Points(foamGeometry, new THREE.PointsMaterial({ color: '#e3f4df', size: .14, transparent: true, opacity: .72, depthWrite: false }));
scene.add(foam);

function createPalm(scale = 1) {
  const palm = new THREE.Group();
  const trunk = addMesh(new THREE.CylinderGeometry(.11, .2, 3.8, 7), materials.wood, palm, [0, 1.85, 0]);
  trunk.rotation.z = -.09;
  const crown = new THREE.Group();
  crown.position.set(-.17, 3.75, 0);
  palm.add(crown);
  for (let i = 0; i < 7; i++) {
    const leaf = addMesh(new THREE.SphereGeometry(1, 7, 4), materials.leaf, crown, [0, 0, 0], [1.55, .07, .34]);
    leaf.rotation.y = i / 7 * Math.PI * 2;
    leaf.rotation.z = -.22;
    leaf.position.x = Math.cos(leaf.rotation.y) * .55;
    leaf.position.z = -Math.sin(leaf.rotation.y) * .55;
  }
  palm.scale.setScalar(scale);
  return palm;
}
for (let i = 0; i < 25; i++) {
  const palm = createPalm(.65 + Math.random() * .75);
  palm.position.set(6.4 + Math.random() * 13, 0, 20 - i * 16 + Math.random() * 7);
  palm.rotation.y = Math.random() * Math.PI;
  scene.add(palm);
  registerMover(palm, 408, 38);
}
const rockMaterials = [
  new THREE.MeshStandardMaterial({ color: '#aa8964', roughness: 1 }),
  new THREE.MeshStandardMaterial({ color: '#c3a477', roughness: 1 }),
  new THREE.MeshStandardMaterial({ color: '#8e9271', roughness: 1 })
];
for (let i = 0; i < 36; i++) {
  const size = .5 + Math.random() * 2;
  const rock = addMesh(new THREE.DodecahedronGeometry(size, 0), rockMaterials[i % 3], scene,
    [6 + Math.random() * 25, size * .25 - .15, 20 - i * 11], [1.2, .65 + Math.random(), 1]);
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  registerMover(rock, 410, 40);
}

function createCloud() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: '#f5f1df', transparent: true, opacity: .72, roughness: 1, depthWrite: false });
  for (let i = 0; i < 5; i++) {
    const puff = addMesh(new THREE.SphereGeometry(2 + Math.random() * 2, 10, 7), material, group,
      [(i - 2) * 2.2, Math.random() * 1.6, Math.random() * 2], [1.3, .65, 1]);
    puff.castShadow = false;
  }
  return group;
}
const clouds = [];
for (let i = 0; i < 11; i++) {
  const cloud = createCloud();
  cloud.position.set(-90 + Math.random() * 190, 28 + Math.random() * 28, -80 - Math.random() * 190);
  cloud.scale.setScalar(.8 + Math.random() * 1.4);
  scene.add(cloud);
  clouds.push(cloud);
}

const lighthouse = new THREE.Group();
addMesh(new THREE.CylinderGeometry(1.25, 1.7, 8, 16), materials.white, lighthouse, [0, 4, 0]);
addMesh(new THREE.CylinderGeometry(1.29, 1.48, 1.4, 16), materials.coral, lighthouse, [0, 4.8, 0]);
addMesh(new THREE.CylinderGeometry(1.45, 1.45, .35, 16), materials.dark, lighthouse, [0, 8.15, 0]);
addMesh(new THREE.CylinderGeometry(.9, .9, 1.25, 12), new THREE.MeshStandardMaterial({ color: '#ffd778', emissive: '#ffbd55', emissiveIntensity: .5 }), lighthouse, [0, 8.85, 0]);
addMesh(new THREE.ConeGeometry(1.35, 1.1, 16), materials.coral, lighthouse, [0, 10, 0]);
lighthouse.position.set(13, 0, -125);
scene.add(lighthouse);
registerMover(lighthouse, 410, 40);

const boats = [];
for (let i = 0; i < 5; i++) {
  const boat = new THREE.Group();
  addMesh(new THREE.SphereGeometry(1, 10, 6), materials.wood, boat, [0, 0, 0], [1.4, .25, .55]);
  tubeBetween([0, 0, 0], [0, 3.5, 0], .035, materials.dark, boat, 6);
  const sailGeometry = new THREE.BufferGeometry();
  sailGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, .5, 0, 0, 3.3, 0, 2.1, .5, 0], 3));
  sailGeometry.computeVertexNormals();
  addMesh(sailGeometry, new THREE.MeshStandardMaterial({ color: i % 2 ? '#f5e8c9' : '#ef795b', side: THREE.DoubleSide }), boat);
  boat.position.set(-18 - Math.random() * 50, 0, -50 - i * 55);
  boat.rotation.y = Math.random() * Math.PI;
  boat.scale.setScalar(.7 + Math.random() * .6);
  scene.add(boat);
  boats.push(boat);
}

function createWheel() {
  const wheel = new THREE.Group();
  const tire = addMesh(new THREE.TorusGeometry(.76, .07, 10, 32), materials.rubber, wheel);
  tire.rotation.y = Math.PI / 2;
  const rim = addMesh(new THREE.TorusGeometry(.67, .022, 6, 28), materials.metal, wheel);
  rim.rotation.y = Math.PI / 2;
  tubeBetween([-.13, 0, 0], [.13, 0, 0], .065, materials.metal, wheel);
  for (let i = 0; i < 12; i++) {
    const angle = i / 12 * Math.PI * 2;
    tubeBetween([0, 0, 0], [0, Math.cos(angle) * .65, Math.sin(angle) * .65], .008, materials.metal, wheel, 4);
  }
  return wheel;
}

const player = new THREE.Group();
const rig = new THREE.Group();
player.add(rig);
scene.add(player);
const rearWheel = createWheel();
rearWheel.position.set(0, .82, 1.15);
rig.add(rearWheel);
const frontWheel = createWheel();
frontWheel.position.set(0, .82, -1.25);
rig.add(frontWheel);
const framePoints = {
  rear: [0, .82, 1.15], crank: [0, 1.03, .18], seat: [0, 1.9, .58], head: [0, 1.8, -.83], front: [0, .82, -1.25]
};
for (const [a, b] of [['rear', 'crank'], ['rear', 'seat'], ['seat', 'crank'], ['seat', 'head'], ['head', 'crank'], ['head', 'front']]) {
  tubeBetween(framePoints[a], framePoints[b], .045, materials.coral, rig);
}
tubeBetween([-.38, 1.9, -.86], [.38, 1.9, -.86], .035, materials.dark, rig);
tubeBetween([0, 1.8, -.83], [0, 1.92, -.86], .04, materials.metal, rig);
addMesh(new THREE.SphereGeometry(.25, 12, 8), materials.dark, rig, [0, 1.96, .65], [1, .18, 1.4]);
const pedal = new THREE.Group();
pedal.position.set(...framePoints.crank);
rig.add(pedal);
tubeBetween([-.38, 0, 0], [.38, 0, 0], .025, materials.metal, pedal);
addMesh(new THREE.BoxGeometry(.25, .045, .13), materials.dark, pedal, [-.43, 0, 0]);
addMesh(new THREE.BoxGeometry(.25, .045, .13), materials.dark, pedal, [.43, 0, 0]);

const body = addMesh(new THREE.SphereGeometry(1, 24, 18), materials.white, rig, [0, 2.85, .42], [.61, .83, .55]);
body.rotation.x = -.2;
addMesh(new THREE.SphereGeometry(1, 20, 14), materials.featherShade, rig, [0, 2.63, .79], [.48, .57, .32]);
const neck = addMesh(new THREE.SphereGeometry(1, 20, 14), materials.white, rig, [0, 3.53, .02], [.34, .62, .34]);
neck.rotation.x = -.15;
const head = addMesh(new THREE.SphereGeometry(1, 24, 18), materials.white, rig, [0, 4.05, -.22], [.45, .45, .46]);
const upperBeak = addMesh(new THREE.SphereGeometry(1, 20, 12), materials.beak, rig, [0, 4.02, -1.01], [.25, .115, .82]);
const pouch = addMesh(new THREE.SphereGeometry(1, 20, 12), materials.orange, rig, [0, 3.86, -.9], [.27, .2, .64]);
pouch.rotation.x = -.1;
for (const side of [-1, 1]) {
  const lens = addMesh(new THREE.SphereGeometry(1, 16, 10), materials.lens, rig, [side * .205, 4.15, -.608], [.205, .135, .055]);
  lens.rotation.y = side * -.1;
  tubeBetween([side * .35, 4.17, -.55], [side * .46, 4.16, -.28], .018, materials.dark, rig, 6);
}
tubeBetween([-.07, 4.16, -.65], [.07, 4.16, -.65], .022, materials.dark, rig, 6);
const helmet = addMesh(new THREE.SphereGeometry(.5, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), materials.helmet, rig, [0, 4.25, -.18], [1, .78, 1]);
addMesh(new THREE.BoxGeometry(.075, .1, .8), materials.white, rig, [0, 4.57, -.15]);
tubeBetween([-.38, 4.22, -.16], [-.28, 3.77, -.12], .018, materials.dark, rig, 6);
tubeBetween([.38, 4.22, -.16], [.28, 3.77, -.12], .018, materials.dark, rig, 6);
const scarfRing = addMesh(new THREE.TorusGeometry(.34, .095, 8, 24), materials.scarf, rig, [0, 3.61, .07]);
scarfRing.rotation.x = Math.PI / 2;

const wings = [];
for (const side of [-1, 1]) {
  const wing = new THREE.Group();
  wing.position.set(side * .43, 3.1, .25);
  wing.rotation.z = side * -.36;
  wing.rotation.x = -.55;
  rig.add(wing);
  addMesh(new THREE.SphereGeometry(1, 16, 12), materials.white, wing, [side * .12, -.37, -.28], [.23, .65, .25]);
  for (let i = 0; i < 3; i++) {
    addMesh(new THREE.SphereGeometry(1, 10, 7), materials.featherShade, wing, [side * (.13 + i * .025), -.72, -.35 + i * .09], [.08, .35, .1]);
  }
  wings.push(wing);
}
const legs = [];
for (const side of [-1, 1]) {
  const leg = new THREE.Group();
  leg.position.set(side * .29, 2.55, .42);
  rig.add(leg);
  addMesh(new THREE.CylinderGeometry(.075, .065, 1.25, 8), materials.orange, leg, [0, -.55, 0]);
  addMesh(new THREE.SphereGeometry(1, 12, 8), materials.orange, leg, [0, -1.17, -.12], [.15, .08, .34]);
  legs.push(leg);
}

const headlamp = new THREE.SpotLight('#ffe4a3', 0, 32, .42, .55, 1.3);
headlamp.position.set(0, 1.62, -.95);
headlamp.target.position.set(0, .2, -15);
rig.add(headlamp, headlamp.target);
addMesh(new THREE.SphereGeometry(.1, 12, 8), new THREE.MeshStandardMaterial({ color: '#fff2b0', emissive: '#ffd46a', emissiveIntensity: 1 }), rig, [0, 1.63, -.98], [1, 1, .5]);

const caughtFish = new THREE.Group();
addMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: '#77b9b1', roughness: .5 }), caughtFish, [0, 0, 0], [.16, .11, .4]);
const caughtTail = addMesh(new THREE.ConeGeometry(.18, .3, 3), materials.coral, caughtFish, [0, 0, .43]);
caughtTail.rotation.x = Math.PI / 2;
caughtFish.position.set(.2, 3.91, -1.65);
caughtFish.rotation.z = .4;
caughtFish.visible = false;
rig.add(caughtFish);

const scarfCount = 17;
const scarfNodes = [];
const scarfAnchor = new THREE.Vector3(0, 3.63, .31);
for (let i = 0; i < scarfCount; i++) {
  const point = scarfAnchor.clone().add(new THREE.Vector3(0, -i * .018, i * .19));
  scarfNodes.push({ position: point, previous: point.clone() });
}
const scarfPositions = new Float32Array(scarfCount * 2 * 3);
const scarfIndices = [];
for (let i = 0; i < scarfCount - 1; i++) {
  const a = i * 2;
  scarfIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
}
const scarfGeometry = new THREE.BufferGeometry();
scarfGeometry.setAttribute('position', new THREE.BufferAttribute(scarfPositions, 3));
scarfGeometry.setIndex(scarfIndices);
const scarfCloth = new THREE.Mesh(scarfGeometry, materials.scarf);
scarfCloth.castShadow = true;
scarfCloth.frustumCulled = false;
rig.add(scarfCloth);

function updateScarf(dt, time) {
  const step = Math.min(dt, .025);
  const stepSq = step * step;
  scarfNodes[0].position.copy(scarfAnchor);
  scarfNodes[0].position.x = Math.sin(time * 4) * .025;
  for (let i = 1; i < scarfCount; i++) {
    const node = scarfNodes[i];
    const current = node.position.clone();
    node.position.add(node.position.clone().sub(node.previous).multiplyScalar(.965));
    node.position.x += (Math.sin(time * 2.7 + i * .47) * 1.25 - state.lean * 4) * stepSq;
    node.position.y += (-2.7 + Math.sin(time * 4 + i) * .4) * stepSq;
    node.position.z += (4 + state.speed * .8) * stepSq;
    node.previous.copy(current);
  }
  for (let iteration = 0; iteration < 5; iteration++) {
    scarfNodes[0].position.copy(scarfAnchor);
    for (let i = 1; i < scarfCount; i++) {
      const previous = scarfNodes[i - 1].position;
      const current = scarfNodes[i].position;
      const delta = current.clone().sub(previous);
      const distance = Math.max(delta.length(), .0001);
      const correction = delta.multiplyScalar((distance - .19) / distance);
      if (i > 1) previous.addScaledVector(correction, .48);
      current.addScaledVector(correction, i === 1 ? -1 : -.52);
    }
  }
  for (let i = 0; i < scarfCount; i++) {
    const point = scarfNodes[i].position;
    const width = .15 * (1 - i / scarfCount * .45);
    scarfPositions[i * 6] = point.x - width;
    scarfPositions[i * 6 + 1] = point.y;
    scarfPositions[i * 6 + 2] = point.z;
    scarfPositions[i * 6 + 3] = point.x + width;
    scarfPositions[i * 6 + 4] = point.y;
    scarfPositions[i * 6 + 5] = point.z;
  }
  scarfGeometry.attributes.position.needsUpdate = true;
  scarfGeometry.computeVertexNormals();
}

function createFish(index) {
  const fish = new THREE.Group();
  const palette = ['#75c6bb', '#edb953', '#70a9c2'];
  const fishMaterial = new THREE.MeshStandardMaterial({ color: palette[index % palette.length], roughness: .38, metalness: .12 });
  addMesh(new THREE.SphereGeometry(1, 14, 10), fishMaterial, fish, [0, 0, 0], [.25, .19, .5]);
  const tail = addMesh(new THREE.ConeGeometry(.28, .42, 3), fishMaterial, fish, [0, 0, .55]);
  tail.rotation.x = Math.PI / 2;
  addMesh(new THREE.ConeGeometry(.12, .28, 3), fishMaterial, fish, [0, .2, .05]);
  for (const side of [-1, 1]) {
    addMesh(new THREE.SphereGeometry(.035, 8, 6), materials.dark, fish, [side * .18, .07, -.32]);
  }
  fish.userData.high = index % 4 === 3;
  fish.userData.phase = Math.random() * Math.PI * 2;
  scene.add(fish);
  return fish;
}
const fishes = Array.from({ length: 15 }, (_, i) => createFish(i));
function resetFish(fish, index, initial = false) {
  fish.position.x = lanes[Math.floor(Math.random() * lanes.length)];
  fish.position.z = initial ? -25 - index * 20 : -260 - Math.random() * 90;
  fish.userData.baseY = fish.userData.high ? 5.15 : 4.02;
  fish.visible = true;
}
fishes.forEach((fish, i) => resetFish(fish, i, true));

const particleCount = 150;
const particlePositions = new Float32Array(particleCount * 3);
const particleColors = new Float32Array(particleCount * 3);
const particleData = [];
for (let i = 0; i < particleCount; i++) {
  particlePositions[i * 3 + 1] = -100;
  particleData.push({ life: 0, velocity: new THREE.Vector3() });
}
const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
const particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({ size: .13, vertexColors: true, transparent: true, opacity: .9, depthWrite: false }));
scene.add(particles);
let particleCursor = 0;
function burst(position, color = '#ffd36b', amount = 18) {
  const tint = new THREE.Color(color);
  for (let n = 0; n < amount; n++) {
    const i = particleCursor++ % particleCount;
    particlePositions[i * 3] = position.x;
    particlePositions[i * 3 + 1] = position.y;
    particlePositions[i * 3 + 2] = position.z;
    particleColors[i * 3] = tint.r;
    particleColors[i * 3 + 1] = tint.g;
    particleColors[i * 3 + 2] = tint.b;
    particleData[i].life = .6 + Math.random() * .6;
    particleData[i].velocity.set((Math.random() - .5) * 3, 1 + Math.random() * 3, (Math.random() - .5) * 2);
  }
}

class Soundscape {
  constructor() { this.context = null; this.master = null; }
  init() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = .32;
    this.master.connect(this.context.destination);
    const noiseBuffer = this.context.createBuffer(1, this.context.sampleRate * 3, this.context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const createNoise = (frequency, type) => {
      const source = this.context.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;
      const filter = this.context.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      const gain = this.context.createGain();
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(this.master);
      source.start();
      return gain;
    };
    this.waveGain = createNoise(620, 'lowpass');
    this.windGain = createNoise(1100, 'bandpass');
    this.chain = this.context.createOscillator();
    this.chain.type = 'triangle';
    this.chainGain = this.context.createGain();
    this.chainGain.gain.value = 0;
    this.chain.connect(this.chainGain).connect(this.master);
    this.chain.start();
    const lfo = this.context.createOscillator();
    const lfoGain = this.context.createGain();
    lfo.frequency.value = .16;
    lfoGain.gain.value = .025;
    lfo.connect(lfoGain).connect(this.waveGain.gain);
    lfo.start();
  }
  setMuted(muted) {
    state.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : .32, this.context.currentTime, .08);
    $('#sound-btn use').setAttribute('href', muted ? '#i-muted' : '#i-sound');
  }
  update(speed) {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.waveGain.gain.setTargetAtTime(.085 + Math.sin(state.elapsed * .45) * .018, now, .3);
    this.windGain.gain.setTargetAtTime(.008 + speed * .0018, now, .15);
    this.chain.frequency.setTargetAtTime(28 + speed * 4.5, now, .08);
    this.chainGain.gain.setTargetAtTime(state.grounded ? .009 + speed * .0005 : .002, now, .1);
  }
  tone(frequency, duration = .15, type = 'sine', delay = 0, volume = .12, endFrequency = null) {
    if (!this.context || state.muted) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + .015);
    gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + .02);
  }
  play(name) {
    if (name === 'catch') { this.tone(620, .16, 'sine', 0, .12); this.tone(930, .22, 'sine', .07, .1); }
    if (name === 'jump') this.tone(180, .24, 'triangle', 0, .09, 440);
    if (name === 'land') this.tone(90, .12, 'sine', 0, .1, 48);
    if (name === 'achievement') [523, 659, 784].forEach((f, i) => this.tone(f, .32, 'sine', i * .09, .1));
    if (name === 'click') this.tone(440, .06, 'sine', 0, .04);
  }
}
const sound = new Soundscape();

const achievementDefinitions = [
  { id: 'depart', title: '追风第一步', description: '开始旅程，骑行超过 5 米', test: () => state.distance >= 5 },
  { id: 'first-fish', title: '第一口鲜', description: '成功捕获第 1 条鱼', test: () => state.fish >= 1 },
  { id: 'fish-ten', title: '海岸美食家', description: '累计捕获 10 条鱼', test: () => state.fish >= 10 },
  { id: 'speed', title: '风速认证', description: '骑行速度达到 45 KM/H', test: () => state.maxSpeed >= 45 },
  { id: 'kilometer', title: '一公里俱乐部', description: '单次骑行达到 1 公里', test: () => state.distance >= 1000 },
  { id: 'jump', title: '离开地面', description: '完成第 1 次跳跃', test: () => state.jumps >= 1 },
  { id: 'air', title: '羽毛失重', description: '累计滞空时间达到 5 秒', test: () => state.airTime >= 5 },
  { id: 'wheelie', title: '单轮艺术家', description: '连续抬前轮保持 3 秒', test: () => state.wheelieBest >= 3 },
  { id: 'lanes', title: '变道自如', description: '手动完成 10 次变道', test: () => state.laneChanges >= 10 },
  { id: 'night', title: '星夜旅人', description: '在夜晚累计骑行 20 秒', test: () => state.nightTime >= 20 },
  { id: 'cycle', title: '日月同途', description: '经历一次完整的昼夜循环', test: () => state.dayCycles >= 1 },
  { id: 'combo', title: '连环好胃口', description: '连续捕获 5 条鱼', test: () => state.maxCombo >= 5 },
  { id: 'cameras', title: '海岸导演', description: '体验全部 5 种镜头视角', test: () => state.cameraModes.size >= 5 },
  { id: 'auto', title: '信任海风', description: '自动驾驶累计巡航 15 秒', test: () => state.autoTime >= 15 }
];
let unlocked = new Set();
try { unlocked = new Set(JSON.parse(localStorage.getItem('pelican-coast-achievements') || '[]')); } catch { unlocked = new Set(); }

function renderAchievements() {
  const count = unlocked.size;
  ui.achievementCount.textContent = count;
  $('#achievement-ring-count').textContent = count;
  $('#achievement-progress').style.width = `${count / achievementDefinitions.length * 100}%`;
  $('#achievement-title').textContent = count === 14 ? '传奇海岸骑手' : count >= 7 ? '海风已记住你的名字' : '初次见面，追风者';
  ui.achievementList.innerHTML = achievementDefinitions.map((item, index) => `
    <div class="achievement-item ${unlocked.has(item.id) ? 'unlocked' : ''}">
      <span class="achievement-badge">${String(index + 1).padStart(2, '0')}</span>
      <div><b>${item.title}</b><p>${item.description}</p></div>
      <span class="achievement-state">${unlocked.has(item.id) ? '已达成' : '未解锁'}</span>
    </div>`).join('');
}
function unlock(item) {
  if (unlocked.has(item.id)) return;
  unlocked.add(item.id);
  try { localStorage.setItem('pelican-coast-achievements', JSON.stringify([...unlocked])); } catch { /* 隐私模式下仍可正常游玩 */ }
  renderAchievements();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span class="toast-badge"><svg><use href="#i-trophy"/></svg></span><span><small>成就解锁 ${unlocked.size} / 14</small><b>${item.title}</b></span>`;
  $('#toast-stack').appendChild(toast);
  sound.play('achievement');
  setTimeout(() => { toast.classList.add('leaving'); setTimeout(() => toast.remove(), 350); }, 3400);
}
function checkAchievements() {
  for (const item of achievementDefinitions) if (!unlocked.has(item.id) && item.test()) unlock(item);
}
renderAchievements();

function markInput() {
  if (!state.started) return;
  state.lastInput = state.elapsed;
  if (state.autopilot) {
    state.autopilot = false;
    ui.auto.classList.remove('visible');
  }
}
function changeLane(direction, manual = true) {
  const next = clamp(state.lane + direction, -1, 1);
  if (next === state.lane) return;
  state.lane = next;
  if (manual) { markInput(); state.laneChanges++; sound.play('click'); }
}
function jump(manual = true) {
  if (!state.grounded || !state.started) return;
  if (manual) markInput();
  state.velocityY = 7.2;
  state.grounded = false;
  state.jumps++;
  sound.play('jump');
}
function switchCamera() {
  markInput();
  state.camera = (state.camera + 1) % cameraNames.length;
  state.cameraModes.add(state.camera);
  const number = String(state.camera + 1).padStart(2, '0');
  ui.cameraName.textContent = cameraNames[state.camera];
  ui.cameraIndex.textContent = number;
  ui.cameraNumber.textContent = number;
  sound.play('click');
}
function toggleSound() {
  sound.init();
  sound.setMuted(!state.muted);
}
let activeDrawer = null;
function openDrawer(id) {
  if (activeDrawer) activeDrawer.classList.remove('open');
  activeDrawer = $(id);
  activeDrawer.classList.add('open');
  $('#drawer-backdrop').classList.add('open');
  sound.play('click');
}
function closeDrawer() {
  if (!activeDrawer) return;
  activeDrawer.classList.remove('open');
  activeDrawer = null;
  $('#drawer-backdrop').classList.remove('open');
}

function startRide() {
  if (state.started) return;
  state.started = true;
  state.lastInput = state.elapsed;
  state.cameraModes.add(0);
  document.body.classList.add('started');
  ui.intro.classList.add('hidden');
  ui.mode.textContent = '手动骑行';
  sound.init();
  sound.setMuted(false);
}
$('#start-btn').addEventListener('click', startRide);
$('#sound-btn').addEventListener('click', toggleSound);
$('#camera-btn').addEventListener('click', switchCamera);
$('#achievements-btn').addEventListener('click', () => openDrawer('#achievements-drawer'));
$('#help-btn').addEventListener('click', () => openDrawer('#help-drawer'));
$('.drawer-backdrop').addEventListener('click', closeDrawer);
document.querySelectorAll('.close-drawer').forEach(button => button.addEventListener('click', closeDrawer));
$('.brand').addEventListener('click', event => event.preventDefault());
$('#fullscreen-btn').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
});
$('#quality-btn').addEventListener('click', () => {
  if (state.autoQuality) { state.autoQuality = false; state.quality = 2; }
  else if (state.quality > 0) state.quality--;
  else { state.autoQuality = true; state.quality = 2; }
  applyQuality();
});

const keyActions = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
window.addEventListener('keydown', event => {
  if (keyActions.has(event.code)) event.preventDefault();
  if (event.code === 'Escape') { closeDrawer(); return; }
  if (event.code === 'KeyM' && !event.repeat) { toggleSound(); return; }
  if (event.code === 'KeyH' && !event.repeat) { openDrawer('#help-drawer'); return; }
  if (!state.started && (event.code === 'Space' || event.code === 'Enter')) { startRide(); return; }
  if (activeDrawer) return;
  if (event.code === 'KeyC' && !event.repeat) { switchCamera(); return; }
  if (['KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'ShiftLeft', 'ShiftRight'].includes(event.code)) markInput();
  if (event.code === 'KeyW' || event.code === 'ArrowUp') keys.accelerate = true;
  if (event.code === 'KeyS' || event.code === 'ArrowDown') keys.brake = true;
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') keys.wheelie = true;
  if (!event.repeat && (event.code === 'KeyA' || event.code === 'ArrowLeft')) changeLane(-1);
  if (!event.repeat && (event.code === 'KeyD' || event.code === 'ArrowRight')) changeLane(1);
  if (!event.repeat && event.code === 'Space') jump();
});
window.addEventListener('keyup', event => {
  if (event.code === 'KeyW' || event.code === 'ArrowUp') keys.accelerate = false;
  if (event.code === 'KeyS' || event.code === 'ArrowDown') keys.brake = false;
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') keys.wheelie = false;
});

const touchMap = { accelerate: 'accelerate', brake: 'brake', wheelie: 'wheelie' };
document.querySelectorAll('.touch-btn').forEach(button => {
  const action = button.dataset.action;
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    button.classList.add('pressed');
    if (action === 'left') changeLane(-1);
    else if (action === 'right') changeLane(1);
    else if (action === 'jump') jump();
    else { markInput(); keys[touchMap[action]] = true; }
  });
  const release = () => {
    button.classList.remove('pressed');
    if (touchMap[action]) keys[touchMap[action]] = false;
  };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
});
let gestureStart = null;
renderer.domElement.addEventListener('pointerdown', event => {
  if (event.pointerType === 'touch') gestureStart = { x: event.clientX, y: event.clientY };
});
renderer.domElement.addEventListener('pointerup', event => {
  if (!gestureStart || event.pointerType !== 'touch') return;
  const dx = event.clientX - gestureStart.x;
  const dy = event.clientY - gestureStart.y;
  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) changeLane(dx > 0 ? 1 : -1);
  else if (dy < -45) jump();
  gestureStart = null;
});

function applyQuality() {
  const ratios = [1, 1.4, 2];
  renderer.setPixelRatio(Math.min(devicePixelRatio, ratios[state.quality]));
  renderer.shadowMap.enabled = state.quality > 0;
  sunlight.castShadow = state.quality > 0;
  oceanMaterial.uniforms.uQuality.value = state.quality;
  foamGeometry.setDrawRange(0, [110, 220, 360][state.quality]);
  const labels = ['流畅', '均衡', '高画质'];
  ui.quality.textContent = `${state.autoQuality ? 'AUTO · ' : ''}${labels[state.quality]}`;
}

function catchFish(fish) {
  state.fish++;
  state.combo = state.comboLeft > 0 ? state.combo + 1 : 1;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  state.comboLeft = 5;
  state.caughtTimer = .65;
  burst(fish.position, '#ffe083', 22);
  sound.play('catch');
  ui.catchLabel.classList.remove('pop');
  void ui.catchLabel.offsetWidth;
  ui.catchLabel.classList.add('pop');
  resetFish(fish, 0);
}

const skyNight = new THREE.Color('#07182d');
const skyDay = new THREE.Color('#83cbd0');
const skyDawn = new THREE.Color('#eaa07c');
const skyCurrent = new THREE.Color();
function updateDayNight(dt) {
  if (state.started) {
    state.dayTime += dt / 180;
    if (state.dayTime >= 1) { state.dayTime -= 1; state.dayCycles++; }
  }
  const angle = (state.dayTime - .25) * Math.PI * 2;
  const altitude = Math.sin(angle);
  const daylight = clamp((altitude + .14) / .35, 0, 1);
  state.daylight = daylight;
  const dawn = Math.exp(-Math.abs(altitude) * 7) * .72;
  skyCurrent.copy(skyNight).lerp(skyDay, daylight).lerp(skyDawn, dawn);
  scene.background.copy(skyCurrent);
  scene.fog.color.copy(skyCurrent);
  hemi.intensity = .25 + daylight * .95;
  sunlight.intensity = .12 + daylight * 2.15;
  sunlight.color.set(daylight < .65 ? '#ffc08a' : '#ffe3b6');
  renderer.toneMappingExposure = .72 + daylight * .34;
  oceanMaterial.uniforms.uDay.value = daylight;
  starMaterial.opacity = Math.pow(1 - daylight, 1.5) * .9;
  headlamp.intensity = (1 - daylight) * 95;
  sun.position.set(-48 + Math.cos(angle) * 28, 10 + altitude * 72, -175);
  moon.position.set(-38 - Math.cos(angle) * 35, 8 - altitude * 65, -155);
  sun.visible = altitude > -.2;
  moon.visible = altitude < .25;
  if (state.started && daylight < .22) state.nightTime += dt;
  const totalMinutes = Math.floor(state.dayTime * 24 * 60);
  ui.clock.textContent = `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
  const hour = state.dayTime * 24;
  ui.period.textContent = hour >= 5 && hour < 8 ? '晨光骑行' : hour >= 8 && hour < 17 ? '晴日巡游' : hour >= 17 && hour < 20 ? '落日追风' : '星夜漫游';
  const percent = state.dayTime * 100;
  ui.cycle.style.width = `${percent}%`;
  ui.marker.style.left = `${percent}%`;
}

const cameraTarget = new THREE.Vector3();
const cameraPosition = new THREE.Vector3();
function updateCamera(dt) {
  const x = state.x;
  switch (state.camera) {
    case 0:
      cameraPosition.set(x + 5.5, 4.5 + state.jumpY * .22, 9.1);
      cameraTarget.set(x * .45, 2.15 + state.jumpY * .25, -4.8);
      break;
    case 1:
      cameraPosition.set(-9.5, 3.1 + state.jumpY * .15, 1.5);
      cameraTarget.set(x, 2.3 + state.jumpY, -1.8);
      break;
    case 2:
      cameraPosition.set(x, 4.28 + state.jumpY, -1.03);
      cameraTarget.set(x + state.lean * 2, 3.8 + state.jumpY, -28);
      break;
    case 3:
      cameraPosition.set(x + 1, 17, 8.5);
      cameraTarget.set(x, .5, -7);
      break;
    default:
      cameraPosition.set(Math.sin(state.elapsed * .22) * 7.5, 2.8 + Math.sin(state.elapsed * .4) * .5, -6.8 + Math.cos(state.elapsed * .22) * 2);
      cameraTarget.set(x, 2.45 + state.jumpY * .5, .1);
  }
  if (!state.started) {
    cameraPosition.set(7.8 + Math.sin(state.elapsed * .12), 4.3, 8.8);
    cameraTarget.set(-1.1, 2.25, -3.5);
  }
  const smoothing = 1 - Math.exp(-dt * (state.camera === 2 ? 12 : 3.5));
  camera.position.lerp(cameraPosition, smoothing);
  const currentLook = camera.userData.look || cameraTarget.clone();
  currentLook.lerp(cameraTarget, smoothing);
  camera.userData.look = currentLook;
  camera.lookAt(currentLook);
  const targetFov = state.camera === 2 ? 66 : 53 + state.speed * .22;
  camera.fov = lerp(camera.fov, targetFov, smoothing);
  camera.updateProjectionMatrix();
}

let fpsFrames = 0;
let fpsTime = 0;
let highFpsWindows = 0;
function updatePerformance(dt) {
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime < 2) return;
  const fps = Math.round(fpsFrames / fpsTime);
  ui.fps.textContent = `${fps} FPS`;
  if (state.autoQuality && state.elapsed > 5) {
    if (fps < 43 && state.quality > 0) { state.quality--; highFpsWindows = 0; applyQuality(); }
    else if (fps > 57 && state.quality < 2) {
      highFpsWindows++;
      if (highFpsWindows >= 3) { state.quality++; highFpsWindows = 0; applyQuality(); }
    } else highFpsWindows = 0;
  }
  fpsFrames = 0;
  fpsTime = 0;
}

function updateParticles(dt) {
  for (let i = 0; i < particleCount; i++) {
    const data = particleData[i];
    if (data.life <= 0) continue;
    data.life -= dt;
    data.velocity.y -= 5 * dt;
    particlePositions[i * 3] += data.velocity.x * dt;
    particlePositions[i * 3 + 1] += data.velocity.y * dt;
    particlePositions[i * 3 + 2] += data.velocity.z * dt + state.speed * dt * .25;
    if (data.life <= 0) particlePositions[i * 3 + 1] = -100;
  }
  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.color.needsUpdate = true;
}

function updateGame(dt) {
  const active = state.started;
  if (active && !state.autopilot && state.elapsed - state.lastInput > 6) {
    state.autopilot = true;
    state.autoLaneAt = state.elapsed + 1.5;
    state.autoJumpAt = state.elapsed + 3.5;
    ui.auto.classList.add('visible');
  }
  if (state.autopilot) {
    state.autoTime += dt;
    if (state.elapsed > state.autoLaneAt) {
      const choices = state.lane === 0 ? [-1, 1] : [-state.lane, 0];
      changeLane(choices[Math.floor(Math.random() * choices.length)] || 0, false);
      state.autoLaneAt = state.elapsed + 3 + Math.random() * 3;
    }
    if (state.elapsed > state.autoJumpAt) {
      jump(false);
      if (Math.random() > .45) state.autoWheelieUntil = state.elapsed + 1.8;
      state.autoJumpAt = state.elapsed + 5 + Math.random() * 5;
    }
  }
  let targetSpeed = active ? 8.5 : 4.5;
  if (state.autopilot) targetSpeed = 12.5 + Math.sin(state.elapsed * .35) * 2;
  else if (keys.accelerate) targetSpeed = 22;
  else if (keys.brake) targetSpeed = 1.2;
  state.speed = lerp(state.speed, targetSpeed, 1 - Math.exp(-dt * (keys.brake ? 3.5 : 1.15)));
  state.maxSpeed = Math.max(state.maxSpeed, state.speed * 3.6);
  if (active) state.distance += state.speed * dt;

  const previousX = state.x;
  state.x = lerp(state.x, lanes[state.lane + 1], 1 - Math.exp(-dt * 5.5));
  state.lean = lerp(state.lean, clamp((state.x - previousX) / Math.max(dt, .001) * -.09, -.32, .32), 1 - Math.exp(-dt * 7));
  player.position.x = state.x;
  player.rotation.z = state.lean;

  if (!state.grounded) {
    state.velocityY -= 17.5 * dt;
    state.jumpY += state.velocityY * dt;
    if (active) state.airTime += dt;
    if (state.jumpY <= 0) {
      state.jumpY = 0;
      state.velocityY = 0;
      state.grounded = true;
      state.landingSquash = .16;
      sound.play('land');
      burst(new THREE.Vector3(state.x, .2, .8), '#e8d39f', 10);
    }
  }
  const wheelieInput = (keys.wheelie || state.elapsed < state.autoWheelieUntil) && state.speed > 5 && state.grounded;
  state.wheelie = lerp(state.wheelie, wheelieInput ? .34 : 0, 1 - Math.exp(-dt * 5));
  if (active && wheelieInput && state.wheelie > .22) {
    state.wheelieTime += dt;
    state.wheelieBest = Math.max(state.wheelieBest, state.wheelieTime);
  } else state.wheelieTime = 0;
  state.landingSquash = Math.max(0, state.landingSquash - dt);
  const squash = Math.sin(state.landingSquash / .16 * Math.PI) * .05;
  rig.position.y = state.jumpY - squash;
  rig.scale.y = 1 - squash * .6;
  rig.rotation.x = state.wheelie + (!state.grounded ? clamp(-state.velocityY * .018, -.09, .09) : 0);

  const pedalPhase = state.elapsed * state.speed * 1.25;
  rearWheel.rotation.x -= state.speed * dt / .76;
  frontWheel.rotation.x -= state.speed * dt / .76;
  pedal.rotation.x = pedalPhase;
  legs[0].rotation.x = Math.sin(pedalPhase) * .5;
  legs[1].rotation.x = Math.sin(pedalPhase + Math.PI) * .5;
  body.rotation.z = Math.sin(pedalPhase * 2) * .012;
  head.rotation.z = Math.sin(state.elapsed * 1.8) * .025;
  wings[0].rotation.x = -.55 + Math.sin(pedalPhase) * .035;
  wings[1].rotation.x = -.55 - Math.sin(pedalPhase) * .035;
  pouch.scale.y = .2 + (state.caughtTimer > 0 ? Math.sin(state.caughtTimer * 12) * .035 + .04 : 0);
  state.caughtTimer = Math.max(0, state.caughtTimer - dt);
  caughtFish.visible = state.caughtTimer > 0;
  if (caughtFish.visible) caughtFish.rotation.y += dt * 5;
  updateScarf(dt, state.elapsed);

  for (const mover of movers) {
    mover.object.position.z += state.speed * dt * mover.factor;
    if (mover.object.position.z > mover.maxZ) mover.object.position.z -= mover.range;
  }
  const foamArray = foamGeometry.attributes.position.array;
  for (let i = 0; i < foamCount; i++) {
    foamArray[i * 3] = -5.8 + Math.sin(state.elapsed * 1.3 + i * 1.7) * .8;
    foamArray[i * 3 + 2] += state.speed * dt;
    if (foamArray[i * 3 + 2] > 30) foamArray[i * 3 + 2] -= 390;
  }
  foamGeometry.attributes.position.needsUpdate = true;
  oceanMaterial.uniforms.uTime.value = state.elapsed;
  for (let i = 0; i < clouds.length; i++) {
    clouds[i].position.x += dt * (.35 + i * .02);
    if (clouds[i].position.x > 120) clouds[i].position.x = -120;
  }
  boats.forEach((boat, i) => {
    boat.position.y = -.05 + Math.sin(state.elapsed * 1.2 + i) * .16;
    boat.rotation.z = Math.sin(state.elapsed * .7 + i) * .035;
  });

  fishes.forEach((fish, index) => {
    fish.position.z += state.speed * dt;
    fish.position.y = fish.userData.baseY + Math.sin(state.elapsed * 3 + fish.userData.phase) * .22;
    fish.rotation.y = Math.sin(state.elapsed * 2 + index) * .25;
    fish.rotation.z = Math.sin(state.elapsed * 3 + index) * .12;
    if (fish.position.z > 18) resetFish(fish, index);
    if (active && fish.visible && Math.abs(fish.position.z) < 1.15 && Math.abs(fish.position.x - state.x) < .85 && Math.abs(fish.position.y - (4.02 + state.jumpY)) < 1.0) catchFish(fish);
  });
  if (state.comboLeft > 0) {
    state.comboLeft -= dt;
    if (state.comboLeft <= 0) state.combo = 0;
  }
  ui.combo.classList.toggle('active', state.combo >= 2 && state.comboLeft > 0);
  ui.comboCount.textContent = `× ${Math.max(2, state.combo)}`;
  ui.comboBar.style.transform = `scaleX(${clamp(state.comboLeft / 5, 0, 1)})`;
  ui.speed.textContent = String(Math.round(state.speed * 3.6)).padStart(2, '0');
  ui.distance.textContent = (state.distance / 1000).toFixed(2);
  ui.fish.textContent = state.fish;
  ui.mode.textContent = !active ? '准备出发' : state.autopilot ? '自动巡航中' : keys.accelerate ? '全力踩踏' : keys.brake ? '海岸滑行' : '手动骑行';
  sound.update(state.speed);
  updateParticles(dt);
  if (active) checkAchievements();
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .04);
  state.elapsed += dt;
  updateDayNight(dt);
  updateGame(dt);
  updateCamera(dt);
  updatePerformance(dt);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  applyQuality();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) clock.getDelta();
});
window.addEventListener('blur', () => {
  keys.accelerate = keys.brake = keys.wheelie = false;
});

applyQuality();
updateScarf(.016, 0);
animate();
requestAnimationFrame(() => requestAnimationFrame(() => {
  ui.loading.classList.add('hidden');
  document.body.classList.add('ready');
}));
