import {useEffect, useState} from 'react';

/* Hash routing, so deep links work on GitHub Pages without a server.
   #/work/<id>  → project page
   #work, #about … → home, scrolled to that section
   anything else → home */

export type Route = {name: 'home'; anchor?: string} | {name: 'project'; id: string};

function parse(hash: string): Route {
  const project = hash.match(/^#\/work\/([\w-]+)/);
  if (project) return {name: 'project', id: project[1]};
  const anchor = hash.match(/^#([\w-]+)$/);
  return {name: 'home', anchor: anchor?.[1]};
}

export function projectHref(id: string) {
  return `#/work/${id}`;
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}
