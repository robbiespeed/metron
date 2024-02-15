import type { GlobalHTMLAttributes } from '../dom-types/global-attributes.js';
import type { EventHandler } from './events.js';

type ScopedProps = {
  [key: `prop:${string}`]: unknown;
};

interface EventHandlerProps<TEventTarget extends EventTarget> {
  [setup: `setup:${string}`]: (element: HTMLElement) => void;
  [event: `on:${string}`]: EventHandler<TEventTarget>;
}

type ScopedGlobalAttributes = {
  [K in keyof GlobalHTMLAttributes as `attr:${K}`]: GlobalHTMLAttributes[K];
};

export type BrowserHTMLAttributes<
  TEventTarget extends EventTarget = EventTarget
> = EventHandlerProps<TEventTarget> &
  ScopedProps &
  ScopedGlobalAttributes &
  GlobalHTMLAttributes;

export interface IntrinsicElements {
  // HTML
  a: BrowserHTMLAttributes<HTMLAnchorElement>;
  abbr: BrowserHTMLAttributes<HTMLElement>;
  address: BrowserHTMLAttributes<HTMLElement>;
  area: BrowserHTMLAttributes<HTMLAreaElement>;
  article: BrowserHTMLAttributes<HTMLElement>;
  aside: BrowserHTMLAttributes<HTMLElement>;
  audio: BrowserHTMLAttributes<HTMLAudioElement>;
  b: BrowserHTMLAttributes<HTMLElement>;
  base: BrowserHTMLAttributes<HTMLBaseElement>;
  bdi: BrowserHTMLAttributes<HTMLElement>;
  bdo: BrowserHTMLAttributes<HTMLElement>;
  blockquote: BrowserHTMLAttributes<HTMLQuoteElement>;
  body: BrowserHTMLAttributes<HTMLBodyElement>;
  br: BrowserHTMLAttributes<HTMLBRElement>;
  button: BrowserHTMLAttributes<HTMLButtonElement>;
  canvas: BrowserHTMLAttributes<HTMLCanvasElement>;
  caption: BrowserHTMLAttributes<HTMLTableCaptionElement>;
  cite: BrowserHTMLAttributes<HTMLElement>;
  code: BrowserHTMLAttributes<HTMLElement>;
  col: BrowserHTMLAttributes<HTMLTableColElement>;
  colgroup: BrowserHTMLAttributes<HTMLTableColElement>;
  data: BrowserHTMLAttributes<HTMLDataElement>;
  datalist: BrowserHTMLAttributes<HTMLDataListElement>;
  dd: BrowserHTMLAttributes<HTMLElement>;
  del: BrowserHTMLAttributes<HTMLModElement>;
  details: BrowserHTMLAttributes<HTMLDetailsElement>;
  dfn: BrowserHTMLAttributes<HTMLElement>;
  dialog: BrowserHTMLAttributes<HTMLDialogElement>;
  div: BrowserHTMLAttributes<HTMLDivElement>;
  dl: BrowserHTMLAttributes<HTMLDListElement>;
  dt: BrowserHTMLAttributes<HTMLElement>;
  em: BrowserHTMLAttributes<HTMLElement>;
  embed: BrowserHTMLAttributes<HTMLEmbedElement>;
  fieldset: BrowserHTMLAttributes<HTMLFieldSetElement>;
  figcaption: BrowserHTMLAttributes<HTMLElement>;
  figure: BrowserHTMLAttributes<HTMLElement>;
  footer: BrowserHTMLAttributes<HTMLElement>;
  form: BrowserHTMLAttributes<HTMLFormElement>;
  h1: BrowserHTMLAttributes<HTMLHeadingElement>;
  h2: BrowserHTMLAttributes<HTMLHeadingElement>;
  h3: BrowserHTMLAttributes<HTMLHeadingElement>;
  h4: BrowserHTMLAttributes<HTMLHeadingElement>;
  h5: BrowserHTMLAttributes<HTMLHeadingElement>;
  h6: BrowserHTMLAttributes<HTMLHeadingElement>;
  head: BrowserHTMLAttributes<HTMLHeadElement>;
  header: BrowserHTMLAttributes<HTMLElement>;
  hgroup: BrowserHTMLAttributes<HTMLElement>;
  hr: BrowserHTMLAttributes<HTMLHRElement>;
  html: BrowserHTMLAttributes<HTMLHtmlElement>;
  i: BrowserHTMLAttributes<HTMLElement>;
  iframe: BrowserHTMLAttributes<HTMLIFrameElement>;
  img: BrowserHTMLAttributes<HTMLImageElement>;
  input: BrowserHTMLAttributes<HTMLInputElement>;
  ins: BrowserHTMLAttributes<HTMLModElement>;
  kbd: BrowserHTMLAttributes<HTMLElement>;
  keygen: BrowserHTMLAttributes<HTMLUnknownElement>;
  label: BrowserHTMLAttributes<HTMLLabelElement>;
  legend: BrowserHTMLAttributes<HTMLLegendElement>;
  li: BrowserHTMLAttributes<HTMLLIElement>;
  link: BrowserHTMLAttributes<HTMLLinkElement>;
  main: BrowserHTMLAttributes<HTMLElement>;
  map: BrowserHTMLAttributes<HTMLMapElement>;
  mark: BrowserHTMLAttributes<HTMLElement>;
  menu: BrowserHTMLAttributes<HTMLMenuElement>;
  meta: BrowserHTMLAttributes<HTMLMetaElement>;
  meter: BrowserHTMLAttributes<HTMLMeterElement>;
  nav: BrowserHTMLAttributes<HTMLElement>;
  noscript: BrowserHTMLAttributes<HTMLElement>;
  object: BrowserHTMLAttributes<HTMLObjectElement>;
  ol: BrowserHTMLAttributes<HTMLOListElement>;
  optgroup: BrowserHTMLAttributes<HTMLOptGroupElement>;
  option: BrowserHTMLAttributes<HTMLOptionElement>;
  output: BrowserHTMLAttributes<HTMLOutputElement>;
  p: BrowserHTMLAttributes<HTMLParagraphElement>;
  picture: BrowserHTMLAttributes<HTMLPictureElement>;
  pre: BrowserHTMLAttributes<HTMLPreElement>;
  progress: BrowserHTMLAttributes<HTMLProgressElement>;
  q: BrowserHTMLAttributes<HTMLQuoteElement>;
  rp: BrowserHTMLAttributes<HTMLElement>;
  rt: BrowserHTMLAttributes<HTMLElement>;
  ruby: BrowserHTMLAttributes<HTMLElement>;
  s: BrowserHTMLAttributes<HTMLElement>;
  samp: BrowserHTMLAttributes<HTMLElement>;
  script: BrowserHTMLAttributes<HTMLScriptElement>;
  section: BrowserHTMLAttributes<HTMLElement>;
  select: BrowserHTMLAttributes<HTMLSelectElement>;
  slot: BrowserHTMLAttributes<HTMLSlotElement>;
  small: BrowserHTMLAttributes<HTMLElement>;
  source: BrowserHTMLAttributes<HTMLSourceElement>;
  span: BrowserHTMLAttributes<HTMLSpanElement>;
  strong: BrowserHTMLAttributes<HTMLElement>;
  style: BrowserHTMLAttributes<HTMLStyleElement>;
  sub: BrowserHTMLAttributes<HTMLElement>;
  summary: BrowserHTMLAttributes<HTMLElement>;
  sup: BrowserHTMLAttributes<HTMLElement>;
  table: BrowserHTMLAttributes<HTMLTableElement>;
  tbody: BrowserHTMLAttributes<HTMLTableSectionElement>;
  td: BrowserHTMLAttributes<HTMLTableCellElement>;
  textarea: BrowserHTMLAttributes<HTMLTextAreaElement>;
  tfoot: BrowserHTMLAttributes<HTMLTableSectionElement>;
  th: BrowserHTMLAttributes<HTMLTableCellElement>;
  thead: BrowserHTMLAttributes<HTMLTableSectionElement>;
  time: BrowserHTMLAttributes<HTMLTimeElement>;
  title: BrowserHTMLAttributes<HTMLTitleElement>;
  tr: BrowserHTMLAttributes<HTMLTableRowElement>;
  track: BrowserHTMLAttributes<HTMLTrackElement>;
  u: BrowserHTMLAttributes<HTMLElement>;
  ul: BrowserHTMLAttributes<HTMLUListElement>;
  var: BrowserHTMLAttributes<HTMLElement>;
  video: BrowserHTMLAttributes<HTMLVideoElement>;
  wbr: BrowserHTMLAttributes<HTMLElement>;

  // TODO:
  // SVG
}
