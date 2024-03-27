import type { AriaAttributes } from './aria.js';
import type { SlottableAtomOrValue } from './shared.js';

// spell-checker:disable
export interface GlobalHTMLAttributes extends AriaAttributes {
  accesskey?: SlottableAtomOrValue<string>;
  autocapitalize?: SlottableAtomOrValue<
    undefined | 'off' | 'none' | 'on' | 'sentences' | 'words' | 'characters'
  >;
  // Bad UX and would only be possible with server rendering
  // autofocus?: SlottableAtomOrValue<string>;
  class?: SlottableAtomOrValue<undefined | string>;
  contenteditable?: SlottableAtomOrValue<string>;
  [dataAttribute: `data-${string}`]: SlottableAtomOrValue<string>;
  dir?: SlottableAtomOrValue<undefined | 'rtl' | 'ltr' | 'auto'>;
  draggable?: SlottableAtomOrValue<undefined | 'true' | 'false'>;
  enterkeyhint?: SlottableAtomOrValue<undefined | string>;
  exportparts?: SlottableAtomOrValue<undefined | string>;
  hidden?: SlottableAtomOrValue<undefined | boolean | 'until-found'>;
  id?: SlottableAtomOrValue<undefined | string>;
  inert?: SlottableAtomOrValue<undefined | boolean>;
  inputmode?: SlottableAtomOrValue<
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
  itemid?: SlottableAtomOrValue<undefined | string>;
  itemprop?: SlottableAtomOrValue<undefined | string>;
  itemref?: SlottableAtomOrValue<undefined | string>;
  itemscope?: SlottableAtomOrValue<undefined | string>;
  itemtype?: SlottableAtomOrValue<undefined | string>;
  lang?: SlottableAtomOrValue<undefined | string>;
  nonce?: SlottableAtomOrValue<undefined | string>;
  part?: SlottableAtomOrValue<undefined | string>;
  slot?: SlottableAtomOrValue<undefined | string>;
  spellcheck?: SlottableAtomOrValue<undefined | true | 'true' | 'false'>;
  style?: SlottableAtomOrValue<undefined | string>;
  tabindex?: SlottableAtomOrValue<undefined | `${number}`>;
  title?: SlottableAtomOrValue<undefined | string>;
  translate?: SlottableAtomOrValue<undefined | true | 'yes' | 'no'>;
}
