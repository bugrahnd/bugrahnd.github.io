/* The site's 3D layer. One fixed, transparent WebGL canvas sits behind the page;
   every 3D scene is a drei <View> that tracks a box in the DOM, so all scenes
   share a single renderer while scrolling with the content.

   - <WorldCanvas/>    the canvas itself (mount once, before the content)
   - <ParticleField/>  page-wide dust that drifts with scroll and pointer
   - <HeroStage/>      curved video screen with orbiting project covers */

import {Suspense, useEffect, useMemo, useRef} from 'react';
import {advance, Canvas, useFrame} from '@react-three/fiber';
import {Float, PerspectiveCamera, useTexture, View} from '@react-three/drei';
import * as THREE from 'three';
import {useTokenColor} from '../fx';
import {cn} from '@/lib/utils';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─── Canvas ─────────────────────────────────────────────────────────────────

// Dev only: lets tooling step frames by hand where the tab gets no animation frames.
if (import.meta.env.DEV) (window as unknown as {__r3fAdvance: typeof advance}).__r3fAdvance = advance;

export function WorldCanvas() {
  return (
    <Canvas
      eventSource={document.getElementById('root')!}
      eventPrefix="client"
      dpr={[1, 1.75]}
      gl={{alpha: true, antialias: true}}
      style={{position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0}}>
      <View.Port />
    </Canvas>
  );
}

// ─── Particle field ─────────────────────────────────────────────────────────

/** Fixed, full-window view of slow dust; scrolling flies the camera through it. */
export function ParticleField() {
  return (
    <View className="pointer-events-none fixed inset-0" index={1}>
      <PerspectiveCamera makeDefault position={[0, 0, 8]} fov={50} />
      <Dust />
    </View>
  );
}

function Dust({count = 1600}: {count?: number}) {
  const ink = useTokenColor('--color-text-primary', 'gray');
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      a[i * 3] = (Math.random() - 0.5) * 30;
      a[i * 3 + 1] = (Math.random() - 0.5) * 18;
      a[i * 3 + 2] = -Math.random() * 60;
    }
    return a;
  }, [count]);
  const still = useMemo(reducedMotion, []);

  useFrame((state, dt) => {
    const p = points.current;
    if (!p) return;
    const depth = (window.scrollY / Math.max(1, document.body.scrollHeight - window.innerHeight)) * 40;
    state.camera.position.z = THREE.MathUtils.lerp(state.camera.position.z, 8 - depth, 0.06);
    state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, state.pointer.x * 0.6, 0.04);
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, state.pointer.y * 0.4, 0.04);
    if (!still) p.rotation.z += dt * 0.01;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={ink} size={0.035} sizeAttenuation transparent opacity={0.55} depthWrite={false} />
    </points>
  );
}

// ─── Hero stage ─────────────────────────────────────────────────────────────

/** A curved "cinema" screen playing the gameplay clips, with project covers
    floating around it. Fills its parent box; the camera follows the pointer. */
export function HeroStage({clips, covers, className}: {clips: string[]; covers: string[]; className?: string}) {
  return (
    <View className={cn('absolute inset-0', className)} index={2}>
      <PerspectiveCamera makeDefault position={[0, 0, 7.5]} fov={38} />
      <ambientLight intensity={1} />
      <Rig />
      <Suspense fallback={null}>
        <VideoScreen clips={clips} />
        <OrbitingCovers covers={covers} />
      </Suspense>
    </View>
  );
}

/** Eases the view camera toward the pointer for parallax. */
function Rig() {
  useFrame(state => {
    const c = state.camera;
    c.position.x = THREE.MathUtils.lerp(c.position.x, state.pointer.x * 0.9, 0.05);
    c.position.y = THREE.MathUtils.lerp(c.position.y, state.pointer.y * 0.5, 0.05);
    c.lookAt(-0.6, 0, 0);
  });
  return null;
}

/** Plays the clips one after another into a single VideoTexture. */
function usePlaylistTexture(clips: string[]) {
  const video = useMemo(() => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.crossOrigin = 'anonymous';
    v.preload = 'auto';
    v.src = clips[0];
    return v;
  }, [clips]);
  const texture = useMemo(() => {
    const t = new THREE.VideoTexture(video);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [video]);

  useEffect(() => {
    let i = 0;
    const next = () => {
      i = (i + 1) % clips.length;
      video.src = clips[i];
      void video.play().catch(() => {});
    };
    video.addEventListener('ended', next);
    void video.play().catch(() => {});
    return () => {
      video.removeEventListener('ended', next);
      video.pause();
      texture.dispose();
    };
  }, [video, texture, clips]);

  return texture;
}

function VideoScreen({clips}: {clips: string[]}) {
  const texture = usePlaylistTexture(clips);
  const group = useRef<THREE.Group>(null);
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(4.9, 2.76, 64, 1);
    const pos = g.attributes.position;
    // Bend the plane into a gentle concave arc, like a cinema screen.
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, x * x * 0.09);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  const still = useMemo(reducedMotion, []);

  useFrame(state => {
    const g = group.current;
    if (!g || still) return;
    g.rotation.y = 0.28 + Math.sin(state.clock.elapsedTime * 0.3) * 0.03;
    g.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.05;
  });

  return (
    <group ref={group} position={[-1.7, 0.1, 0]} rotation={[0, 0.28, 0]}>
      <mesh geometry={geometry}>
        <meshBasicMaterial map={texture} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function OrbitingCovers({covers}: {covers: string[]}) {
  const textures = useTexture(covers);
  const group = useRef<THREE.Group>(null);
  const still = useMemo(reducedMotion, []);
  useEffect(() => {
    textures.forEach(t => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
    });
  }, [textures]);

  useFrame((_, dt) => {
    if (group.current && !still) group.current.rotation.y += dt * 0.08;
  });

  return (
    <group ref={group} position={[-1.4, 0, -3.2]}>
      {textures.map((t, i) => {
        const a = (i / textures.length) * Math.PI * 2;
        const r = 4.2;
        return (
          <Float key={i} speed={1.2 + i * 0.15} rotationIntensity={0.5} floatIntensity={1.2}>
            <mesh position={[Math.cos(a) * r, (i % 3) * 0.9 - 0.9, Math.sin(a) * r]} rotation={[0, -a + Math.PI / 2, 0]}>
              <planeGeometry args={[1.25, 0.78]} />
              <meshBasicMaterial map={t} toneMapped={false} side={THREE.DoubleSide} transparent opacity={0.92} />
            </mesh>
          </Float>
        );
      })}
    </group>
  );
}
