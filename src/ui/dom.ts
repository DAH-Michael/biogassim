/** Kleine DOM-Helfer ohne Framework. */
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function svg(markup: string, label?: string): SVGElement {
  const wrap = document.createElement('span');
  wrap.innerHTML = markup;
  const el = wrap.firstElementChild as SVGElement;
  if (label) {
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', label);
  } else el.setAttribute('aria-hidden', 'true');
  return el;
}

export const fmt = {
  int: (v: number) => Math.round(v).toLocaleString('de-DE'),
  dec: (v: number, d = 1) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }),
  eur: (v: number) => `${Math.round(v).toLocaleString('de-DE')} €`,
  pct: (v: number) => `${Math.round(v * 100).toLocaleString('de-DE')} %`,
};
