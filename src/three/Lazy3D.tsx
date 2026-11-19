/* Mounts its 3D child only once it nears the viewport, so the three.js chunk
   is fetched on demand. Holds the space with a placeholder until then. */

import {lazy, Suspense, useEffect, useRef, useState, type ReactNode} from 'react';

export const ProjectRing = lazy(() => import('./ProjectRing'));
export const LiquidBlob = lazy(() => import('./LiquidBlob'));

export function Lazy3D({children, className}: {children: ReactNode; className?: string}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const o = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), {rootMargin: '600px'});
    o.observe(ref.current);
    return () => o.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {near && <Suspense fallback={null}>{children}</Suspense>}
    </div>
  );
}
