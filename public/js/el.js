// Tiny DOM builder: el('div', { class: 'x' }, child, 'text') → HTMLElement. Text is never parsed as HTML.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Parse trusted, static SVG markup (our own icons) into a node. */
export function svg(markup) {
  const holder = document.createElement('span');
  holder.innerHTML = markup;
  return holder.firstElementChild;
}
