import type { GlobalHTMLAttributes } from './global-attributes.js';
import type { AtomOrValue } from './shared.js';

interface EventHandler {
  (this: void, event: unknown): void;
}

type ScopedProps = {
  [key: `prop:${string}`]: unknown;
};

type Parent = {
  children?: unknown;
};

interface EventHandlerProps {
  [event: `on:${string}`]: AtomOrValue<undefined | EventHandler>;
}

type ScopedGlobalAttributes = {
  [K in keyof GlobalHTMLAttributes as `attr:${K}`]: GlobalHTMLAttributes[K];
};

export type BrowserHTMLAttributes = EventHandlerProps &
  ScopedProps &
  ScopedGlobalAttributes &
  GlobalHTMLAttributes &
  Parent;

export interface IntrinsicElements {
  // HTML
  a: BrowserHTMLAttributes;
  abbr: BrowserHTMLAttributes;
  address: BrowserHTMLAttributes;
  area: BrowserHTMLAttributes;
  article: BrowserHTMLAttributes;
  aside: BrowserHTMLAttributes;
  audio: BrowserHTMLAttributes;
  b: BrowserHTMLAttributes;
  base: BrowserHTMLAttributes;
  bdi: BrowserHTMLAttributes;
  bdo: BrowserHTMLAttributes;
  blockquote: BrowserHTMLAttributes;
  body: BrowserHTMLAttributes;
  br: BrowserHTMLAttributes;
  button: BrowserHTMLAttributes;
  canvas: BrowserHTMLAttributes;
  caption: BrowserHTMLAttributes;
  cite: BrowserHTMLAttributes;
  code: BrowserHTMLAttributes;
  col: BrowserHTMLAttributes;
  colgroup: BrowserHTMLAttributes;
  data: BrowserHTMLAttributes;
  datalist: BrowserHTMLAttributes;
  dd: BrowserHTMLAttributes;
  del: BrowserHTMLAttributes;
  details: BrowserHTMLAttributes;
  dfn: BrowserHTMLAttributes;
  dialog: BrowserHTMLAttributes;
  div: BrowserHTMLAttributes;
  dl: BrowserHTMLAttributes;
  dt: BrowserHTMLAttributes;
  em: BrowserHTMLAttributes;
  embed: BrowserHTMLAttributes;
  fieldset: BrowserHTMLAttributes;
  figcaption: BrowserHTMLAttributes;
  figure: BrowserHTMLAttributes;
  footer: BrowserHTMLAttributes;
  form: BrowserHTMLAttributes;
  h1: BrowserHTMLAttributes;
  h2: BrowserHTMLAttributes;
  h3: BrowserHTMLAttributes;
  h4: BrowserHTMLAttributes;
  h5: BrowserHTMLAttributes;
  h6: BrowserHTMLAttributes;
  head: BrowserHTMLAttributes;
  header: BrowserHTMLAttributes;
  hgroup: BrowserHTMLAttributes;
  hr: BrowserHTMLAttributes;
  html: BrowserHTMLAttributes;
  i: BrowserHTMLAttributes;
  iframe: BrowserHTMLAttributes;
  img: BrowserHTMLAttributes;
  input: BrowserHTMLAttributes;
  ins: BrowserHTMLAttributes;
  kbd: BrowserHTMLAttributes;
  keygen: BrowserHTMLAttributes;
  label: BrowserHTMLAttributes;
  legend: BrowserHTMLAttributes;
  li: BrowserHTMLAttributes;
  link: BrowserHTMLAttributes;
  main: BrowserHTMLAttributes;
  map: BrowserHTMLAttributes;
  mark: BrowserHTMLAttributes;
  menu: BrowserHTMLAttributes;
  meta: BrowserHTMLAttributes;
  meter: BrowserHTMLAttributes;
  nav: BrowserHTMLAttributes;
  noscript: BrowserHTMLAttributes;
  object: BrowserHTMLAttributes;
  ol: BrowserHTMLAttributes;
  optgroup: BrowserHTMLAttributes;
  option: BrowserHTMLAttributes;
  output: BrowserHTMLAttributes;
  p: BrowserHTMLAttributes;
  picture: BrowserHTMLAttributes;
  pre: BrowserHTMLAttributes;
  progress: BrowserHTMLAttributes;
  q: BrowserHTMLAttributes;
  rp: BrowserHTMLAttributes;
  rt: BrowserHTMLAttributes;
  ruby: BrowserHTMLAttributes;
  s: BrowserHTMLAttributes;
  samp: BrowserHTMLAttributes;
  script: BrowserHTMLAttributes;
  section: BrowserHTMLAttributes;
  select: BrowserHTMLAttributes;
  slot: BrowserHTMLAttributes;
  small: BrowserHTMLAttributes;
  source: BrowserHTMLAttributes;
  span: BrowserHTMLAttributes;
  strong: BrowserHTMLAttributes;
  style: BrowserHTMLAttributes;
  sub: BrowserHTMLAttributes;
  summary: BrowserHTMLAttributes;
  sup: BrowserHTMLAttributes;
  table: BrowserHTMLAttributes;
  tbody: BrowserHTMLAttributes;
  td: BrowserHTMLAttributes;
  textarea: BrowserHTMLAttributes;
  tfoot: BrowserHTMLAttributes;
  th: BrowserHTMLAttributes;
  thead: BrowserHTMLAttributes;
  time: BrowserHTMLAttributes;
  title: BrowserHTMLAttributes;
  tr: BrowserHTMLAttributes;
  track: BrowserHTMLAttributes;
  u: BrowserHTMLAttributes;
  ul: BrowserHTMLAttributes;
  var: BrowserHTMLAttributes;
  video: BrowserHTMLAttributes;
  wbr: BrowserHTMLAttributes;

  // TODO:
  // SVG
}
