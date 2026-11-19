/* A ring of project covers in 3D (three.js via react-three-fiber).
   Covers sit on curved cylinder segments; the ring idles, spins faster while
   you scroll, can be dragged, and opens a project on click. The far side fades
   into the page through fog tinted with the theme's background colour.
   Loaded lazily so three.js never weighs on the first paint. */

import {Suspense, useEffect, useMemo, useRef, useState} from 'react';
import {useFrame, useThree} from '@react-three/fiber';
import {PerspectiveCamera, useTexture, View} from '@react-three/drei';
import * as THREE from 'three';
import {useTokenColor} from '../fx';

export interface RingItem {
  id: string;
  title: string;
  cover?: string;
  href: string;
}

const RADIUS = 4.4;
const GAP = 0.86; // share of each slot the cover fills
const ASPECT = 16 / 10;

export default function ProjectRing({
  items,
  hint,
  onHover,
}: {
  items: RingItem[];
  hint: string;
  onHover?: (item: RingItem | null) => void;
}) {
  const [hovered, setHovered] = useState<RingItem | null>(null);
  const drag = useRef({active: false, x: 0, moved: 0, velocity: 0});
  const fog = useTokenColor('--color-background-surface', 'white');
  const ink = useTokenColor('--color-text-primary', 'black');
  const accent = useTokenColor('--color-accent', 'orange');

  const hover = (item: RingItem | null) => {
    setHovered(item);
    onHover?.(item);
  };

  return (
    <div
      data-cursor={hovered ? hint : '↔'}
      className="relative h-[min(72svh,720px)] min-h-[420px] w-full touch-pan-y select-none"
      onPointerDown={e => {
        drag.current = {...drag.current, active: true, x: e.clientX, moved: 0};
      }}
      onPointerMove={e => {
        if (!drag.current.active) return;
        const dx = e.clientX - drag.current.x;
        drag.current.x = e.clientX;
        drag.current.moved += Math.abs(dx);
        drag.current.velocity += dx * 0.0009;
      }}
      onPointerUp={() => (drag.current.active = false)}
      onPointerLeave={() => {
        drag.current.active = false;
        hover(null);
      }}>
      {/* Drawn by the shared WorldCanvas; this View tracks the box. */}
      <View className="absolute inset-0" index={3}>
        <PerspectiveCamera makeDefault position={[0, 1.7, 11.5]} fov={34} onUpdate={c => c.lookAt(0, -0.2, 0)} />
        <fog attach="fog" args={[fog, 9, 16.5]} />
        <Suspense fallback={null}>
          <Ring items={items} drag={drag} hovered={hovered} onHover={hover} ink={ink} accent={accent} fog={fog} />
        </Suspense>
      </View>
    </div>
  );
}

function Ring({
  items,
  drag,
  hovered,
  onHover,
  ink,
  accent,
  fog,
}: {
  items: RingItem[];
  drag: React.RefObject<{active: boolean; x: number; moved: number; velocity: number}>;
  hovered: RingItem | null;
  onHover: (item: RingItem | null) => void;
  ink: string;
  accent: string;
  fog: string;
}) {
  const group = useRef<THREE.Group>(null);
  const scrollKick = useRef(0);
  const {scene} = useThree();
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  useEffect(() => {
    scene.fog?.color.set(fog);
  }, [fog, scene]);

  // Scrolling the page spins the ring a little.
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      scrollKick.current += (window.scrollY - last) * 0.00035;
      last = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, {passive: true});
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const d = drag.current;
    const idle = reduced ? 0.02 : hovered ? 0.03 : 0.12;
    d.velocity += scrollKick.current;
    scrollKick.current = 0;
    g.rotation.y += idle * dt + d.velocity;
    d.velocity *= 0.92;
    // Gentle parallax tilt toward the pointer.
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, 0.1 + state.pointer.y * 0.08, 0.05);
    g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, -0.05 + state.pointer.x * 0.04, 0.05);
  });

  const slot = (Math.PI * 2) / items.length;
  const theta = slot * GAP;
  const height = (RADIUS * theta) / ASPECT;

  return (
    <group ref={group}>
      {items.map((item, i) => (
        <Segment
          key={item.id}
          item={item}
          start={i * slot - theta / 2}
          theta={theta}
          height={height}
          isHovered={hovered?.id === item.id}
          isDimmed={Boolean(hovered) && hovered?.id !== item.id}
          onHover={onHover}
          drag={drag}
          ink={ink}
          accent={accent}
        />
      ))}
    </group>
  );
}

function Segment({
  item,
  start,
  theta,
  height,
  isHovered,
  isDimmed,
  onHover,
  drag,
  ink,
  accent,
}: {
  item: RingItem;
  start: number;
  theta: number;
  height: number;
  isHovered: boolean;
  isDimmed: boolean;
  onHover: (item: RingItem | null) => void;
  drag: React.RefObject<{moved: number}>;
  ink: string;
  accent: string;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const texture = item.cover ? <CoverTexture src={item.cover} material={material} /> : null;
  const titleTexture = useMemo(() => (item.cover ? null : makeTitleTexture(item.title, ink, accent)), [item, ink, accent]);
  const geometry = useMemo(
    () => new THREE.CylinderGeometry(RADIUS, RADIUS, height, 48, 1, true, start, theta),
    [start, theta, height],
  );

  useFrame(() => {
    const m = mesh.current;
    const mat = material.current;
    if (!m || !mat) return;
    const s = isHovered ? 1.06 : 1;
    m.scale.x = m.scale.z = THREE.MathUtils.lerp(m.scale.x, s, 0.12);
    m.scale.y = THREE.MathUtils.lerp(m.scale.y, s, 0.12);
    const target = isDimmed ? 0.45 : 1;
    mat.color.setScalar(THREE.MathUtils.lerp(mat.color.r, target, 0.1));
  });

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      onPointerOver={e => {
        e.stopPropagation();
        onHover(item);
      }}
      onPointerOut={() => onHover(null)}
      onClick={e => {
        e.stopPropagation();
        if (drag.current.moved < 8) window.location.hash = item.href.replace(/^#/, '');
      }}>
      <meshBasicMaterial ref={material} side={THREE.DoubleSide} map={titleTexture ?? undefined} toneMapped={false} />
      {texture}
    </mesh>
  );
}

/** Loads a cover and hands it to the segment's material (keeps useTexture inside Suspense). */
function CoverTexture({src, material}: {src: string; material: React.RefObject<THREE.MeshBasicMaterial | null>}) {
  const tex = useTexture(src);
  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    if (material.current) {
      material.current.map = tex;
      material.current.needsUpdate = true;
    }
  }, [tex, material]);
  return null;
}

/** Typographic card for projects without cover art, drawn in the theme's colours. */
function makeTitleTexture(title: string, ink: string, accent: string) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 640;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'italic 300 150px Fraunces, Georgia, serif';
  ctx.fillText(title, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
