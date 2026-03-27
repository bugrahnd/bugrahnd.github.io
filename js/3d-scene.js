import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const canvas = document.getElementById('canvas3d');
if (!canvas) console.error("Canvas bulunamadı!");

// 1. Sahne, Kamera ve Renderer Kurulumu
const scene = new THREE.Scene();
// Arka planı transparan yapıyoruz ki senin CSS gradient'in görünsün
scene.background = null;

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 25;

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ReinhardToneMapping; // Bloom için en iyi tonlama

// 2. Post-Processing (Bloom) Kurulumu
const renderScene = new RenderPass(scene, camera);
// Bloom parametreleri: resolution, strength, radius, threshold
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.5, 0.1);

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// 3. Objelere Karar Verme (Temana uygun renkler)
const colors = [0x4F8EF7, 0x7C5CFC, 0x38BDF8]; // Mavi, Mor, Camgöbeği
const objects = [];

// Low-poly geometrik şekiller (Game dev hissiyatı için)
const geometries = [
    new THREE.IcosahedronGeometry(1, 0), 
    new THREE.BoxGeometry(1.2, 1.2, 1.2),
    new THREE.TetrahedronGeometry(1.2, 0)
];

// Ekrana 40 adet parlayan obje dağıtıyoruz
for (let i = 0; i < 40; i++) {
    const geometry = geometries[Math.floor(Math.random() * geometries.length)];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    // Objenin içi koyu, kenarları/yüzeyi renkli ve parlıyor
    const material = new THREE.MeshStandardMaterial({
        color: 0x080C18,
        emissive: color,
        emissiveIntensity: Math.random() * 1.5 + 0.5,
        wireframe: Math.random() > 0.4 // %60'ı sadece çizgilerden oluşsun
    });

    const mesh = new THREE.Mesh(geometry, material);
    
    // Rastgele konumlara dağıt
    mesh.position.x = (Math.random() - 0.5) * 50;
    mesh.position.y = (Math.random() - 0.5) * 50;
    mesh.position.z = (Math.random() - 0.5) * 30 - 10;
    
    // Dönüş ve süzülme ayarları
    mesh.userData = {
        rotationSpeed: {
            x: (Math.random() - 0.5) * 0.015,
            y: (Math.random() - 0.5) * 0.015,
            z: (Math.random() - 0.5) * 0.015
        },
        floatSpeed: Math.random() * 0.01 + 0.005,
        floatOffset: Math.random() * Math.PI * 2
    };

    scene.add(mesh);
    objects.push(mesh);
}

// 4. Animasyon Döngüsü
const clock = new THREE.Clock();
let mouseX = 0;
let mouseY = 0;

function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    // Objeleri kendi ekseninde döndür ve dalgalandır
    objects.forEach(obj => {
        obj.rotation.x += obj.userData.rotationSpeed.x;
        obj.rotation.y += obj.userData.rotationSpeed.y;
        obj.rotation.z += obj.userData.rotationSpeed.z;
        
        // Y ekseninde yavaşça süzülme
        obj.position.y += Math.sin(elapsedTime * 2 + obj.userData.floatOffset) * obj.userData.floatSpeed;
    });

    // Kamera farenin hareketine göre çok hafif oynasın (Parallax etkisi)
    camera.position.x += (mouseX * 5 - camera.position.x) * 0.05;
    camera.position.y += (-mouseY * 5 - camera.position.y) * 0.05;
    camera.lookAt(scene.position);

    composer.render();
}

// 5. Olay Dinleyicileri (Event Listeners)
window.addEventListener('mousemove', (event) => {
    // Fare koordinatlarını merkeze göre -1 ile 1 arasına normalize et
    mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    mouseY = (event.clientY / window.innerHeight) * 2 - 1;
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

// Başlat
animate();