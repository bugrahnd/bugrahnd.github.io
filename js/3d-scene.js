import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// 1. Temel Kurulum
const canvas = document.getElementById('canvas3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

// Gölgeleri aktif ediyoruz (Spotlight'ın en önemli özelliği)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 8); // Kamerayı tam karşıya aldık

// 2. Arka Plan Duvarı (Işığın ve gölgenin düşeceği yüzey)
const planeGeo = new THREE.PlaneGeometry(50, 50);
const planeMat = new THREE.MeshStandardMaterial({ 
    color: 0x111111, 
    roughness: 0.8,
    metalness: 0.2
});
const plane = new THREE.Mesh(planeGeo, planeMat);
plane.position.z = -3; // Yazıların arkasında kalması için geriye ittik
plane.receiveShadow = true; // Gölgeyi kabul et
scene.add(plane);

// 3. Merkezdeki Obje (Oyun dünyasını temsil eden Poligon Şekil)
const objGeo = new THREE.IcosahedronGeometry(1.2, 0); // Düşük poligonlu (Low-poly) bir şekil
const objMat = new THREE.MeshStandardMaterial({ 
    color: 0x888888, 
    roughness: 0.4, 
    metalness: 0.5 
});
const mesh = new THREE.Mesh(objGeo, objMat);
mesh.castShadow = true;   // Gölge yaratsın
mesh.receiveShadow = true; // Kendi üzerine de gölge düşsün
scene.add(mesh);

// 4. Işıklandırma (Senin attığın Spotlight mantığı)
const ambientLight = new THREE.AmbientLight(0xffffff, 0.2); // Genel loş ışık
scene.add(ambientLight);

const spotLight = new THREE.SpotLight(0xff6b35, 150); // Turuncu spot ışığı
spotLight.position.set(2.5, 3, 3);
spotLight.angle = Math.PI / 5;
spotLight.penumbra = 0.5; // Işığın kenarlarını yumuşatır
spotLight.decay = 2;
spotLight.distance = 20;

// Spotlight gölge ayarları
spotLight.castShadow = true;
spotLight.shadow.mapSize.width = 1024;
spotLight.shadow.mapSize.height = 1024;
spotLight.shadow.camera.near = 1;
spotLight.shadow.camera.far = 10;
spotLight.shadow.focus = 1;
scene.add(spotLight);

// 5. Açık / Koyu Tema Kontrolü
function updateTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
        // Karanlık Tema: Duvar koyu, ışık turuncu, loş ortam
        planeMat.color.setHex(0x111111);
        spotLight.color.setHex(0xff6b35); // Turuncu
        ambientLight.intensity = 0.2;
    } else {
        // Aydınlık Tema: Duvar açık gri, ışık pembe/mor, aydınlık ortam
        planeMat.color.setHex(0xdddddd);
        spotLight.color.setHex(0x9b59b6); // Mor/Pembe
        ambientLight.intensity = 0.6;
    }
}

// Tema değişikliğini dinle
const observer = new MutationObserver(updateTheme);
observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
updateTheme(); // Başlangıçta çalıştır

// 6. Ekran Yeniden Boyutlandırma
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Fare etkileşimi için değişkenler
let mouseX = 0;
let mouseY = 0;
window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
});

// 7. Animasyon Döngüsü
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    
    const time = clock.getElapsedTime();

    // Senin kodundaki ışığın dairesel hareket mantığı
    spotLight.position.x = Math.cos(time * 0.5) * 4;
    spotLight.position.y = Math.sin(time * 0.3) * 2 + 1;
    
    // Objenin yavaşça dönmesi ve fareye tepki vermesi
    mesh.rotation.x += 0.005;
    mesh.rotation.y += 0.01;
    mesh.position.x += (mouseX * 0.5 - mesh.position.x) * 0.05;
    mesh.position.y += (mouseY * 0.5 - mesh.position.y) * 0.05;

    renderer.render(scene, camera);
}

animate();