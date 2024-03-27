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

type Parent = {
  children?: unknown;
};

export type HTMLBrowserJSXProps<
  TEventTarget extends EventTarget = EventTarget
> = EventHandlerProps<TEventTarget> &
  ScopedProps &
  ScopedGlobalAttributes &
  GlobalHTMLAttributes &
  Parent;

export interface IntrinsicElements {
  // HTML
  a: HTMLBrowserJSXProps<HTMLAnchorElement>;
  abbr: HTMLBrowserJSXProps<HTMLElement>;
  address: HTMLBrowserJSXProps<HTMLElement>;
  area: HTMLBrowserJSXProps<HTMLAreaElement>;
  article: HTMLBrowserJSXProps<HTMLElement>;
  aside: HTMLBrowserJSXProps<HTMLElement>;
  audio: HTMLBrowserJSXProps<HTMLAudioElement>;
  b: HTMLBrowserJSXProps<HTMLElement>;
  base: HTMLBrowserJSXProps<HTMLBaseElement>;
  bdi: HTMLBrowserJSXProps<HTMLElement>;
  bdo: HTMLBrowserJSXProps<HTMLElement>;
  blockquote: HTMLBrowserJSXProps<HTMLQuoteElement>;
  body: HTMLBrowserJSXProps<HTMLBodyElement>;
  br: HTMLBrowserJSXProps<HTMLBRElement>;
  button: HTMLBrowserJSXProps<HTMLButtonElement>;
  canvas: HTMLBrowserJSXProps<HTMLCanvasElement>;
  caption: HTMLBrowserJSXProps<HTMLTableCaptionElement>;
  cite: HTMLBrowserJSXProps<HTMLElement>;
  code: HTMLBrowserJSXProps<HTMLElement>;
  col: HTMLBrowserJSXProps<HTMLTableColElement>;
  colgroup: HTMLBrowserJSXProps<HTMLTableColElement>;
  data: HTMLBrowserJSXProps<HTMLDataElement>;
  datalist: HTMLBrowserJSXProps<HTMLDataListElement>;
  dd: HTMLBrowserJSXProps<HTMLElement>;
  del: HTMLBrowserJSXProps<HTMLModElement>;
  details: HTMLBrowserJSXProps<HTMLDetailsElement>;
  dfn: HTMLBrowserJSXProps<HTMLElement>;
  dialog: HTMLBrowserJSXProps<HTMLDialogElement>;
  div: HTMLBrowserJSXProps<HTMLDivElement>;
  dl: HTMLBrowserJSXProps<HTMLDListElement>;
  dt: HTMLBrowserJSXProps<HTMLElement>;
  em: HTMLBrowserJSXProps<HTMLElement>;
  embed: HTMLBrowserJSXProps<HTMLEmbedElement>;
  fieldset: HTMLBrowserJSXProps<HTMLFieldSetElement>;
  figcaption: HTMLBrowserJSXProps<HTMLElement>;
  figure: HTMLBrowserJSXProps<HTMLElement>;
  footer: HTMLBrowserJSXProps<HTMLElement>;
  form: HTMLBrowserJSXProps<HTMLFormElement>;
  h1: HTMLBrowserJSXProps<HTMLHeadingElement>;
  h2: HTMLBrowserJSXProps<HTMLHeadingElement>;
  h3: HTMLBrowserJSXProps<HTMLHeadingElement>;
  h4: HTMLBrowserJSXProps<HTMLHeadingElement>;
  h5: HTMLBrowserJSXProps<HTMLHeadingElement>;
  h6: HTMLBrowserJSXProps<HTMLHeadingElement>;
  head: HTMLBrowserJSXProps<HTMLHeadElement>;
  header: HTMLBrowserJSXProps<HTMLElement>;
  hgroup: HTMLBrowserJSXProps<HTMLElement>;
  hr: HTMLBrowserJSXProps<HTMLHRElement>;
  html: HTMLBrowserJSXProps<HTMLHtmlElement>;
  i: HTMLBrowserJSXProps<HTMLElement>;
  iframe: HTMLBrowserJSXProps<HTMLIFrameElement>;
  img: HTMLBrowserJSXProps<HTMLImageElement>;
  input: HTMLBrowserJSXProps<HTMLInputElement>;
  ins: HTMLBrowserJSXProps<HTMLModElement>;
  kbd: HTMLBrowserJSXProps<HTMLElement>;
  keygen: HTMLBrowserJSXProps<HTMLUnknownElement>;
  label: HTMLBrowserJSXProps<HTMLLabelElement>;
  legend: HTMLBrowserJSXProps<HTMLLegendElement>;
  li: HTMLBrowserJSXProps<HTMLLIElement>;
  link: HTMLBrowserJSXProps<HTMLLinkElement>;
  main: HTMLBrowserJSXProps<HTMLElement>;
  map: HTMLBrowserJSXProps<HTMLMapElement>;
  mark: HTMLBrowserJSXProps<HTMLElement>;
  menu: HTMLBrowserJSXProps<HTMLMenuElement>;
  meta: HTMLBrowserJSXProps<HTMLMetaElement>;
  meter: HTMLBrowserJSXProps<HTMLMeterElement>;
  nav: HTMLBrowserJSXProps<HTMLElement>;
  noscript: HTMLBrowserJSXProps<HTMLElement>;
  object: HTMLBrowserJSXProps<HTMLObjectElement>;
  ol: HTMLBrowserJSXProps<HTMLOListElement>;
  optgroup: HTMLBrowserJSXProps<HTMLOptGroupElement>;
  option: HTMLBrowserJSXProps<HTMLOptionElement>;
  output: HTMLBrowserJSXProps<HTMLOutputElement>;
  p: HTMLBrowserJSXProps<HTMLParagraphElement>;
  picture: HTMLBrowserJSXProps<HTMLPictureElement>;
  pre: HTMLBrowserJSXProps<HTMLPreElement>;
  progress: HTMLBrowserJSXProps<HTMLProgressElement>;
  q: HTMLBrowserJSXProps<HTMLQuoteElement>;
  rp: HTMLBrowserJSXProps<HTMLElement>;
  rt: HTMLBrowserJSXProps<HTMLElement>;
  ruby: HTMLBrowserJSXProps<HTMLElement>;
  s: HTMLBrowserJSXProps<HTMLElement>;
  samp: HTMLBrowserJSXProps<HTMLElement>;
  script: HTMLBrowserJSXProps<HTMLScriptElement>;
  section: HTMLBrowserJSXProps<HTMLElement>;
  select: HTMLBrowserJSXProps<HTMLSelectElement>;
  slot: HTMLBrowserJSXProps<HTMLSlotElement>;
  small: HTMLBrowserJSXProps<HTMLElement>;
  source: HTMLBrowserJSXProps<HTMLSourceElement>;
  span: HTMLBrowserJSXProps<HTMLSpanElement>;
  strong: HTMLBrowserJSXProps<HTMLElement>;
  style: HTMLBrowserJSXProps<HTMLStyleElement>;
  sub: HTMLBrowserJSXProps<HTMLElement>;
  summary: HTMLBrowserJSXProps<HTMLElement>;
  sup: HTMLBrowserJSXProps<HTMLElement>;
  table: HTMLBrowserJSXProps<HTMLTableElement>;
  tbody: HTMLBrowserJSXProps<HTMLTableSectionElement>;
  td: HTMLBrowserJSXProps<HTMLTableCellElement>;
  textarea: HTMLBrowserJSXProps<HTMLTextAreaElement>;
  tfoot: HTMLBrowserJSXProps<HTMLTableSectionElement>;
  th: HTMLBrowserJSXProps<HTMLTableCellElement>;
  thead: HTMLBrowserJSXProps<HTMLTableSectionElement>;
  time: HTMLBrowserJSXProps<HTMLTimeElement>;
  title: HTMLBrowserJSXProps<HTMLTitleElement>;
  tr: HTMLBrowserJSXProps<HTMLTableRowElement>;
  track: HTMLBrowserJSXProps<HTMLTrackElement>;
  u: HTMLBrowserJSXProps<HTMLElement>;
  ul: HTMLBrowserJSXProps<HTMLUListElement>;
  var: HTMLBrowserJSXProps<HTMLElement>;
  video: HTMLBrowserJSXProps<HTMLVideoElement>;
  wbr: HTMLBrowserJSXProps<HTMLElement>;

  // TODO:
  // SVG
}
