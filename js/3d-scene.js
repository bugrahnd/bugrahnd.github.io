import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

let camera, scene, renderer, composer, mixer, clock;

const params = {
    threshold: 0,
    strength: 1.5, // Başlangıç parlaklık gücü
    radius: 0,
    exposure: 1
};

init();

function init() {
    const canvas = document.getElementById('canvas3d');

    // 1. Render Motoru Kurulumu
    renderer = new THREE.WebGLRenderer( { canvas: canvas, antialias: true, alpha: true } );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    
    // Orijinal örnekteki kritik ışık ayarı
    renderer.toneMapping = THREE.ReinhardToneMapping;

    // 2. Sahne ve Kamera
    scene = new THREE.Scene();
    
    camera = new THREE.PerspectiveCamera( 40, window.innerWidth / window.innerHeight, 1, 100 );
    camera.position.set( 0, 0, 20 );
    scene.add( camera );

    // 3. Işık (Genel ortam ışığı)
    scene.add( new THREE.AmbientLight( 0x404040 ) );

    // Orijinal Örnekteki Rastgele Parlayan Objeleri Oluşturma
    // Portfolio için Icosahedron (Oyunsu bir geometri) kullanıyoruz
    const geometry = new THREE.IcosahedronGeometry( 1, 1 );

    // Bir grup oluşturup küreleri içine atıyoruz ki hepsini birden döndürebilelim
    const particleGroup = new THREE.Group();
    scene.add( particleGroup );

    // 100 adet rastgele renkli ve boyutlu obje
    for ( let i = 0; i < 100; i ++ ) {
        const color = new THREE.Color();
        // Orijinal repodaki gibi rastgele parlak renkler oluşturuyoruz
        color.setHSL( Math.random(), 0.7, Math.random() * 0.2 + 0.05 );

        const material = new THREE.MeshBasicMaterial( { color: color } );
        const sphere = new THREE.Mesh( geometry, material );

        // Objeleri rastgele pozisyonlara dağıt
        sphere.position.x = Math.random() * 10 - 5;
        sphere.position.y = Math.random() * 10 - 5;
        sphere.position.z = Math.random() * 10 - 5;
        sphere.position.normalize().multiplyScalar( Math.random() * 4.0 + 2.0 );
        
        // Rastgele boyutlandır
        sphere.scale.setScalar( Math.random() * Math.random() + 0.5 );
        
        particleGroup.add( sphere );
    }

    // 4. Post-Processing (UNREAL BLOOM) Orijinal Kurulumu
    const renderScene = new RenderPass( scene, camera );

    const bloomPass = new UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 1.5, 0.4, 0.85 );
    bloomPass.threshold = params.threshold;
    bloomPass.strength = params.strength;
    bloomPass.radius = params.radius;

    composer = new EffectComposer( renderer );
    composer.addPass( renderScene );
    composer.addPass( bloomPass );

    // 5. GUI Kontrol Paneli (Orijinal örnekteki gibi)
    const gui = new GUI();
    gui.add( params, 'exposure', 0.1, 2 ).onChange( function ( value ) {
        renderer.toneMappingExposure = Math.pow( value, 4.0 );
    } ).name('Kamera Pozlaması');

    gui.add( params, 'threshold', 0.0, 1.0 ).onChange( function ( value ) {
        bloomPass.threshold = Number( value );
    } ).name('Parlaklık Eşiği');

    gui.add( params, 'strength', 0.0, 3.0 ).onChange( function ( value ) {
        bloomPass.strength = Number( value );
    } ).name('Bloom Gücü');

    gui.add( params, 'radius', 0.0, 1.0 ).step( 0.01 ).onChange( function ( value ) {
        bloomPass.radius = Number( value );
    } ).name('Bloom Yarıçapı');


    window.addEventListener( 'resize', onWindowResize );

    clock = new THREE.Clock();
    renderer.setAnimationLoop( animate );
}

function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize( width, height );
    composer.setSize( width, height );
}

// 6. Farenin pozisyonunu takip etme (Hafif bir paralaks efekti için)
let mouseX = 0;
let mouseY = 0;
window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX - window.innerWidth / 2) * 0.005;
    mouseY = (e.clientY - window.innerHeight / 2) * 0.005;
});

function animate() {
    const delta = clock.getDelta();

    // Objelerin bulunduğu grubu yavaşça kendi etrafında döndür
    scene.children[1].rotation.y += 0.2 * delta; // AmbientLight 0. index, Group 1. index
    scene.children[1].rotation.x += 0.1 * delta;

    // Farenin hareketine göre sahneyi hafifçe kaydır (Oyun hissi verir)
    camera.position.x += (mouseX - camera.position.x) * 0.05;
    camera.position.y += (-mouseY - camera.position.y) * 0.05;
    camera.lookAt(scene.position);

    // renderer.render YERİNE composer.render kullanıyoruz
    composer.render();
}