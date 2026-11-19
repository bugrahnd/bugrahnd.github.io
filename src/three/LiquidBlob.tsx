/* A glossy, liquid blob in the theme's accent colour (three.js via
   react-three-fiber + drei). It leans toward the pointer and ripples harder
   on hover. Lighting comes from in-scene Lightformers, so no HDR files are
   fetched. Loaded lazily. */

import {useRef, useState, type ComponentRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {Environment, Float, Lightformer, MeshDistortMaterial, PerspectiveCamera, View} from '@react-three/drei';
import * as THREE from 'three';
import {useTokenColor} from '../fx';

export default function LiquidBlob({label}: {label: string}) {
  const accent = useTokenColor('--color-accent', 'orange');

  return (
    <div role="img" aria-label={label} data-cursor="✺" className="relative aspect-square w-full max-w-[34rem]">
      {/* Drawn by the shared WorldCanvas; this View tracks the box. */}
      <View className="absolute inset-0" index={4}>
        <PerspectiveCamera makeDefault position={[0, 0, 4.2]} fov={40} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[3, 4, 5]} intensity={1.6} />
        <Blob color={accent} />
        <Environment resolution={256}>
          <Lightformer form="ring" intensity={4} position={[0, 2.5, 4]} scale={3} />
          <Lightformer form="rect" intensity={2} position={[-4, 0, 2]} scale={[2, 6, 1]} />
          <Lightformer form="rect" intensity={1.5} position={[4, -1, 1]} scale={[2, 5, 1]} />
        </Environment>
      </View>
    </div>
  );
}

function Blob({color}: {color: string}) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<ComponentRef<typeof MeshDistortMaterial>>(null);
  const [hovered, setHovered] = useState(false);

  useFrame(state => {
    const m = mesh.current;
    if (!m) return;
    m.rotation.y = THREE.MathUtils.lerp(m.rotation.y, state.pointer.x * 0.6, 0.06);
    m.rotation.x = THREE.MathUtils.lerp(m.rotation.x, -state.pointer.y * 0.4, 0.06);
    if (material.current) {
      material.current.distort = THREE.MathUtils.lerp(material.current.distort, hovered ? 0.6 : 0.38, 0.06);
    }
  });

  return (
    <Float speed={1.6} rotationIntensity={0.4} floatIntensity={0.9}>
      <mesh ref={mesh} scale={1.35} onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
        <icosahedronGeometry args={[1, 96]} />
        <MeshDistortMaterial
          ref={material}
          color={color}
          roughness={0.12}
          metalness={0.55}
          clearcoat={1}
          clearcoatRoughness={0.15}
          distort={0.38}
          speed={2.2}
        />
      </mesh>
    </Float>
  );
}
