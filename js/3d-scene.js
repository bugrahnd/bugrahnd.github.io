import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { GUI } from 'https://unpkg.com/three@0.160.0/examples/jsm/libs/lil-gui.module.min.js';
import { PLYLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/PLYLoader.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';

let renderer, scene, camera;
let spotLight;

init();

function init() {
    // 1. Render Motoru (Arka planı transparan yaptık ki sitenin renkleri görünsün)
    const canvas = document.getElementById('canvas3d');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setAnimationLoop(animate);

    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 2. Sahne ve Kamera
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(7, 4, 1);

    // 3. Kamera Kontrolleri (Fare ile döndürme)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.minDistance = 2;
    controls.maxDistance = 10;
    controls.maxPolarAngle = Math.PI / 2; // Yerin altına geçmeyi engeller
    controls.target.set(0, 1, 0);
    controls.update();

    // 4. Dokular (Spot ışığının filtresi)
    const textureLoader = new THREE.TextureLoader();
    // Orijinal repodaki disturb.jpg dosyasını CDN'den çekiyoruz
    const disturbTexture = textureLoader.load('https://unpkg.com/three@0.160.0/examples/textures/disturb.jpg');
    disturbTexture.minFilter = THREE.LinearFilter;
    disturbTexture.magFilter = THREE.LinearFilter;
    disturbTexture.colorSpace = THREE.SRGBColorSpace;

    // 5. Işıklandırma
    const ambient = new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 0.25);
    scene.add(ambient);

    spotLight = new THREE.SpotLight(0xffffff, 100);
    spotLight.name = 'spotLight';
    spotLight.map = disturbTexture; // Deseni ışığa atıyoruz
    spotLight.position.set(2.5, 5, 2.5);
    spotLight.angle = Math.PI / 6;
    spotLight.penumbra = 1;
    spotLight.decay = 2;
    spotLight.distance = 0;

    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    spotLight.shadow.camera.near = 2;
    spotLight.shadow.camera.far = 10;
    spotLight.shadow.focus = 1;
    spotLight.shadow.bias = -0.003;
    spotLight.shadow.intensity = 1;
    scene.add(spotLight);

    // Işık asistanları (Görünmez başlattık, menüden açılabilir)
    spotLight.lightHelper = new THREE.SpotLightHelper(spotLight);
    spotLight.lightHelper.visible = false;
    scene.add(spotLight.lightHelper);

    spotLight.shadowCameraHelper = new THREE.CameraHelper(spotLight.shadow.camera);
    spotLight.shadowCameraHelper.visible = false;
    scene.add(spotLight.shadowCameraHelper);

    // 6. Zemin (Gölgelerin düşeceği yer)
    const geometry = new THREE.PlaneGeometry(100, 100);
    const material = new THREE.MeshLambertMaterial({ color: 0x222222 }); // Sitenle uyumlu koyu zemin
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, -1, 0);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // 7. Orijinal 3D Modeli Yükleme (Lucy Heykeli)
    new PLYLoader().load('https://unpkg.com/three@0.160.0/examples/models/ply/binary/Lucy100k.ply', function (geometry) {
        geometry.scale(0.0024, 0.0024, 0.0024);
        geometry.computeVertexNormals();

        const material = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.y = -Math.PI / 2;
        mesh.position.y = 0.8;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
    });

    // 8. Pencere Boyutu Değişimi
    window.addEventListener('resize', onWindowResize);

    // 9. lil-gui (Sağ Üstteki Kontrol Paneli)
    const gui = new GUI();
    const params = {
        color: spotLight.color.getHex(),
        intensity: spotLight.intensity,
        distance: spotLight.distance,
        angle: spotLight.angle,
        penumbra: spotLight.penumbra,
        decay: spotLight.decay,
        focus: spotLight.shadow.focus,
        shadowIntensity: spotLight.shadow.intensity,
        helpers: false
    };

    gui.addColor(params, 'color').onChange(val => spotLight.color.setHex(val)).name('Işık Rengi');
    gui.add(params, 'intensity', 0, 500).onChange(val => spotLight.intensity = val).name('Güç');
    gui.add(params, 'distance', 0, 20).onChange(val => spotLight.distance = val).name('Mesafe');
    gui.add(params, 'angle', 0, Math.PI / 3).onChange(val => spotLight.angle = val).name('Açı');
    gui.add(params, 'penumbra', 0, 1).onChange(val => spotLight.penumbra = val).name('Yumuşaklık');
    gui.add(params, 'decay', 1, 2).onChange(val => spotLight.decay = val).name('Sönümlenme');
    gui.add(params, 'focus', 0, 1).onChange(val => spotLight.shadow.focus = val).name('Gölge Odak');
    gui.add(params, 'shadowIntensity', 0, 1).onChange(val => spotLight.shadow.intensity = val).name('Gölge Gücü');
    gui.add(params, 'helpers').onChange(val => {
        spotLight.lightHelper.visible = val;
        spotLight.shadowCameraHelper.visible = val;
    }).name('Asistan Çizgiler');
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    const time = performance.now() / 3000;

    // Işığın dairesel hareketi
    if (spotLight) {
        spotLight.position.x = Math.cos(time) * 2.5;
        spotLight.position.z = Math.sin(time) * 2.5;
        if (spotLight.lightHelper) spotLight.lightHelper.update();
    }

    renderer.render(scene, camera);
}