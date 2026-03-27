import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

let camera, scene, renderer, composer, mainMesh;

// Bloom parametreleri (Senin temanla otomatik değişecek)
const bloomParams = {
    threshold: 0,
    strength: 1.5, // Karanlık tema için varsayılan güç
    radius: 1
};

init();

function init() {
    const canvas = document.getElementById('canvas3d');

    // 1. Render Motoru (alpha: true sitenin arkasının görünmesi için)
    renderer = new THREE.WebGLRenderer( { canvas: canvas, antialias: true, alpha: true } );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    
    // Orijinal Bloom örneğindeki kritik ton eşleme ayarı (Parlamayı patlatmaz)
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.2; // Biraz daha canlılık

    // 2. Sahne ve Kamera
    scene = new THREE.Scene();
    
    camera = new THREE.PerspectiveCamera( 40, window.innerWidth / window.innerHeight, 1, 100 );
    camera.position.set( 0, 0, 15 );
    scene.add( camera );

    // 3. Işıklar (Modelin materyalindeki rengi göstermesi için)
    const ambientLight = new THREE.AmbientLight( 0x404040, 2 );
    scene.add( ambientLight );

    const pointLight = new THREE.PointLight( 0xffffff, 50, 20 );
    pointLight.position.set( 5, 5, 5 );
    scene.add( pointLight );

    // 4. İŞTE O MODEL: Merkezdeki Parlayan Geometri
    // Orijinal örneğe benzeyen bölümlenmiş poligon şekil (Subdivided Icosahedron)
    const geometry = new THREE.IcosahedronGeometry( 3, 4 ); 

    // MeshStandardMaterial kullanıyoruz, parlamayı sağlayacak olan 'emissive' (kendi kendine ışık yayma) ayarıdır.
    // Başlangıç renklerini karanlık tema için neon turuncu yapıyoruz.
    const material = new THREE.MeshStandardMaterial( { 
        color: 0x222222, // Ana renk koyu
        emissive: 0xff6b35, // Neon Turuncu parıltı (Karanlık Tema)
        emissiveIntensity: 2, // Parıltı şiddeti
        roughness: 0.1,
        metalness: 0.8
    } );

    mainMesh = new THREE.Mesh( geometry, material );
    scene.add( mainMesh );

    // 5. Post-Processing: UNREAL BLOOM (Sihrin Gerçekleştiği Yer)
    const renderScene = new RenderPass( scene, camera );

    // Çözünürlük, Güç, Yarıçap, Eşik
    const bloomPass = new UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 1.5, 0.4, 0.85 );
    bloomPass.threshold = bloomParams.threshold;
    bloomPass.strength = bloomParams.strength;
    bloomPass.radius = bloomParams.radius;

    composer = new EffectComposer( renderer );
    composer.addPass( renderScene );
    composer.addPass( bloomPass );

    // 6. Tema Değişikliği ve Parlamanın İlişkilendirilmesi
    function updateThemeEffects() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        
        if (mainMesh && mainMesh.material) {
            if (isDark) {
                // Karanlık Tema -> Neon Turuncu, Yüksek Parlaklık
                mainMesh.material.emissive.setHex( 0xff6b35 );
                mainMesh.material.emissiveIntensity = 2;
                bloomPass.strength = 1.5;
                bloomPass.radius = 1;
            } else {
                // Aydınlık Tema -> Neon Pembe/Mor, Daha Hafif Parlaklık
                mainMesh.material.emissive.setHex( 0xe91e63 );
                mainMesh.material.emissiveIntensity = 0.8;
                bloomPass.strength = 0.5; // Aydınlıkta göz yormaması için düşürüldü
                bloomPass.radius = 0.5;
            }
        }
    }

    // HTML etiketindeki 'data-theme' değişimini dinle
    const observer = new MutationObserver(updateThemeEffects);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    
    // Sayfa ilk yüklendiğinde de temayı kontrol et
    updateThemeEffects();

    // 7. Pencere Boyut Değişimi
    window.addEventListener( 'resize', onWindowResize );

    // 8. Fare Etkileşimi (Hafif paralaks efekti)
    let mouseX = 0;
    let mouseY = 0;
    window.addEventListener('mousemove', (e) => {
        mouseX = (e.clientX - window.innerWidth / 2) * 0.005;
        mouseY = (e.clientY - window.innerHeight / 2) * 0.005;
    });

    // 9. Animasyon Döngüsü
    const clock = new THREE.Clock();

    function animate() {
        requestAnimationFrame( animate );

        const delta = clock.getDelta();

        // Modelin kendi etrafında yavaşça dönmesi
        if (mainMesh) {
            mainMesh.rotation.y += 0.3 * delta;
            mainMesh.rotation.x += 0.1 * delta;
        }

        // Farenin hareketine göre sahneyi hafifçe kaydır (Derinlik hissi)
        camera.position.x += (mouseX - camera.position.x) * 0.05;
        camera.position.y += (-mouseY - camera.position.y) * 0.05;
        camera.lookAt(scene.position);

        // composer.render kullanıyoruz (Bloom efekti için)
        composer.render();
    }

    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
    composer.setSize( window.innerWidth, window.innerHeight );
}