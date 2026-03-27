import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { EffectComposer } from 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js';

// 1. Sahne, Kamera ve Render Motoru Kurulumu
const canvas = document.getElementById('canvas3d');
if (!canvas) console.error("Canvas bulunamadı!");

// Arka planın transparan olması için alpha: true ekliyoruz (CSS ile uyum için)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 100);
camera.position.set(0, 0, 12);

// 2. Ana Obje (Neon TorusKnot - Oyunumsu bir hissiyat verir)
const geometry = new THREE.TorusKnotGeometry(1.8, 0.5, 128, 32);
const material = new THREE.MeshStandardMaterial({ 
    color: 0xff6b35, 
    emissive: 0xff6b35, 
    emissiveIntensity: 2,
    wireframe: true // Matrix/Cyberpunk havası katar
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// 3. Etrafta Uçuşan Partiküller (Oyun dünyası tozu)
const particleGeo = new THREE.BufferGeometry();
const particleCount = 300;
const posArray = new Float32Array(particleCount * 3);
for(let i = 0; i < particleCount * 3; i++) {
    posArray[i] = (Math.random() - 0.5) * 20; // x, y, z
}
particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const particleMat = new THREE.PointsMaterial({
    size: 0.05,
    color: 0xffd93d,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending
});
const particles = new THREE.Points(particleGeo, particleMat);
scene.add(particles);

// 4. Işıklandırma
scene.add(new THREE.AmbientLight(0x404040)); // Temel ışık

// 5. Post-Processing (UNREAL BLOOM)
const renderScene = new RenderPass(scene, camera);
// Çözünürlük, Güç, Yarıçap, Eşik (Threshold)
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0;
bloomPass.strength = 1.8; // İlk başta karanlık tema gücü
bloomPass.radius = 0.5;

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// 6. Tema Değişikliği (Açık/Koyu) Kontrolü
function updateTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
        // Karanlık Tema: Yüksek neon parlaklığı, turuncu/sarı renkler
        bloomPass.strength = 1.8;
        material.emissiveIntensity = 2;
        material.color.setHex(0xff6b35); // Turuncu
        material.emissive.setHex(0xff6b35);
        particleMat.color.setHex(0xffd93d); // Sarı
    } else {
        // Aydınlık Tema: Göz yormaması için düşük parlaklık, mor/turkuaz renkler
        bloomPass.strength = 0.5; 
        material.emissiveIntensity = 0.8;
        material.color.setHex(0x9b59b6); // Mor
        material.emissive.setHex(0x9b59b6);
        particleMat.color.setHex(0x4ecdc4); // Turkuaz
    }
}

// HTML etiketindeki 'data-theme' değişimini dinle
const observer = new MutationObserver(updateTheme);
observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
updateTheme(); // Sayfa yüklendiğinde temayı kontrol et

// 7. Ekran Yeniden Boyutlandırma
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

// 8. Fare (Mouse) Etkileşimi
let mouseX = 0;
let mouseY = 0;
let targetX = 0;
let targetY = 0;
const windowHalfX = window.innerWidth / 2;
const windowHalfY = window.innerHeight / 2;

document.addEventListener('mousemove', (event) => {
    mouseX = (event.clientX - windowHalfX);
    mouseY = (event.clientY - windowHalfY);
});

// 9. Animasyon Döngüsü
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    
    const delta = clock.getDelta();
    
    // Farenin konumuna doğru yumuşak (smooth) dönüş
    targetX = mouseX * 0.001;
    targetY = mouseY * 0.001;
    
    // Kendi etrafında dönme
    mesh.rotation.y += 0.3 * delta;
    mesh.rotation.x += 0.2 * delta;
    
    // Fareye tepki
    mesh.rotation.y += 0.05 * (targetX - mesh.rotation.y);
    mesh.rotation.x += 0.05 * (targetY - mesh.rotation.x);
    
    // Partiküllerin yavaşça dönmesi
    particles.rotation.y -= 0.05 * delta;

    // renderer.render(scene, camera) YERİNE composer kullanıyoruz (Bloom için)
    composer.render();
}
animate();