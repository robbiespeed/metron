import type { AriaAttributes } from './aria.js';
import type { AtomOrValue } from './shared.js';

// spell-checker:disable
export interface GlobalHTMLAttributes extends AriaAttributes {
  [attribute: string]: AtomOrValue<
    undefined | boolean | number | string | Function
  >;
  accesskey?: AtomOrValue<string>;
  autocapitalize?: AtomOrValue<
    undefined | 'off' | 'none' | 'on' | 'sentences' | 'words' | 'characters'
  >;
  // Bad UX and would only be possible with server rendering
  // autofocus?: AtomOrValue<string>;
  class?: AtomOrValue<undefined | string>;
  contenteditable?: AtomOrValue<string>;
  [dataAttribute: `data-${string}`]: AtomOrValue<string>;
  dir?: AtomOrValue<undefined | 'rtl' | 'ltr' | 'auto'>;
  draggable?: AtomOrValue<undefined | 'true' | 'false'>;
  enterkeyhint?: AtomOrValue<undefined | string>;
  exportparts?: AtomOrValue<undefined | string>;
  hidden?: AtomOrValue<undefined | boolean | 'until-found'>;
  id?: AtomOrValue<undefined | string>;
  inert?: AtomOrValue<undefined | boolean>;
  inputmode?: AtomOrValue<
    | undefined
    | 'none'
    | 'text'
    | 'decimal'
    | 'numeric'
    | 'tel'
    | 'search'
    | 'email'
    | 'url'
  >;
  // Not supported using setAttribute
  // is?: undefined | string;
  itemid?: AtomOrValue<undefined | string>;
  itemprop?: AtomOrValue<undefined | string>;
  itemref?: AtomOrValue<undefined | string>;
  itemscope?: AtomOrValue<undefined | string>;
  itemtype?: AtomOrValue<undefined | string>;
  lang?: AtomOrValue<undefined | string>;
  nonce?: AtomOrValue<undefined | string>;
  part?: AtomOrValue<undefined | string>;
  slot?: AtomOrValue<undefined | string>;
  spellcheck?: AtomOrValue<undefined | true | 'true' | 'false'>;
  style?: AtomOrValue<undefined | string>;
  tabindex?: AtomOrValue<undefined | `${number}`>;
  title?: AtomOrValue<undefined | string>;
  translate?: AtomOrValue<undefined | true | 'yes' | 'no'>;
}
