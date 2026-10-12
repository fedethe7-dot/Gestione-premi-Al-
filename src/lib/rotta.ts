/** Navigazione basata sull'hash dell'indirizzo (compatibile con GitHub Pages). */
export interface Rotta { path: string; params: URLSearchParams }

export function leggiRotta(): Rotta {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, q] = h.split('?');
  return { path: path || '', params: new URLSearchParams(q || '') };
}

export function vai(path: string, params?: Record<string, string>) {
  const q = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString() : '';
  location.hash = '#/' + path + (q ? '?' + q : '');
}
