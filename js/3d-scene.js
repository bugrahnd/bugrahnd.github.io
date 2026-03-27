import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const canvas = document.getElementById('canvas3d');
if (!canvas) { console.warn('canvas3d bulunamadı'); }

const scene  = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.z = 28;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ReinhardToneMapping;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.55, 0.4, 0.2
));

const PALETTE  = [0x4F8EF7, 0x7C5CFC, 0x38BDF8];
const GEO_POOL = [
    new THREE.IcosahedronGeometry(1,   0),
    new THREE.IcosahedronGeometry(0.7, 0),
    new THREE.BoxGeometry(1.1, 1.1, 1.1),
    new THREE.TetrahedronGeometry(1,   0),
    new THREE.OctahedronGeometry(0.9,  0),
];

const objects = [];
const COUNT   = 22;

for (let i = 0; i < COUNT; i++) {
    const geo   = GEO_POOL[Math.floor(Math.random() * GEO_POOL.length)];
    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const isWire = Math.random() > 0.35;

    const mat = new THREE.MeshStandardMaterial({
        color:             isWire ? color : 0x080C18,
        emissive:          color,
        emissiveIntensity: isWire ? Math.random() * 0.6 + 0.2 : Math.random() * 1.0 + 0.4,
        wireframe:         isWire,
        transparent:       !isWire,
        opacity:           isWire ? 1 : 0.55,
    });

    const scale = Math.random() * 0.7 + 0.5;
    const mesh  = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(scale);

    const angle  = (i / COUNT) * Math.PI * 2;
    const radius = 14 + Math.random() * 12;
    mesh.position.set(
        Math.cos(angle) * radius + (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 18 - 8
    );

    mesh.userData = {
        rx: (Math.random() - 0.5) * 0.008,
        ry: (Math.random() - 0.5) * 0.010,
        rz: (Math.random() - 0.5) * 0.006,
        floatAmp:    Math.random() * 0.018 + 0.006,
        floatSpeed:  Math.random() * 0.4   + 0.25,
        floatOffset: Math.random() * Math.PI * 2,
        baseY:       mesh.position.y,
    };

    scene.add(mesh);
    objects.push(mesh);
}

scene.add(new THREE.AmbientLight(0xffffff, 0.3));

const clock = new THREE.Clock();
let mouseX = 0, mouseY = 0, targetX = 0, targetY = 0;

function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    objects.forEach(obj => {
        const d = obj.userData;
        obj.rotation.x += d.rx;
        obj.rotation.y += d.ry;
        obj.rotation.z += d.rz;
        obj.position.y = d.baseY + Math.sin(t * d.floatSpeed + d.floatOffset) * d.floatAmp * 30;
    });

    targetX += (mouseX * 3 - targetX) * 0.04;
    targetY += (-mouseY * 3 - targetY) * 0.04;
    camera.position.x = targetX;
    camera.position.y = targetY;
    camera.lookAt(scene.position);

    composer.render();
}

window.addEventListener('mousemove', e => {
    mouseX = (e.clientX / window.innerWidth)  * 2 - 1;
    mouseY = (e.clientY / window.innerHeight) * 2 - 1;
}, { passive: true });

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}, { passive: true });

animate();