import type { AtomOrValue } from './shared.js';

export type BooleanString = 'true' | 'false';

// spell-checker:disable
// All the WAI-ARIA 1.1 attributes from https://www.w3.org/TR/wai-aria-1.1/
export interface AriaAttributes {
  /** Identifies the currently active element when DOM focus is on a composite widget, textbox, group, or application. */
  'aria-activedescendant'?: AtomOrValue<string | undefined>;
  /** Indicates whether assistive technologies will present all, or only parts of, the changed region based on the change notifications defined by the aria-relevant attribute. */
  'aria-atomic'?: AtomOrValue<BooleanString | undefined>;
  /**
   * Indicates whether inputting text could trigger display of one or more predictions of the user's intended value for an input and specifies how predictions would be
   * presented if they are made.
   */
  'aria-autocomplete'?: AtomOrValue<
    'none' | 'inline' | 'list' | 'both' | undefined
  >;
  /**
   * Defines a string value that labels the current element, which is intended to be converted into Braille.
   * @see aria-label.
   */
  'aria-braillelabel'?: AtomOrValue<string | undefined>;
  /**
   * Defines a human-readable, author-localized abbreviated description for the role of an element, which is intended to be converted into Braille.
   * @see aria-roledescription.
   */
  'aria-brailleroledescription'?: AtomOrValue<string | undefined>;
  /** Indicates an element is being modified and that assistive technologies MAY want to wait until the modifications are complete before exposing them to the user. */
  'aria-busy'?: AtomOrValue<BooleanString | undefined>;
  /**
   * Indicates the current "checked" state of checkboxes, radio buttons, and other widgets.
   * @see aria-pressed
   * @see aria-selected.
   */
  'aria-checked'?: AtomOrValue<BooleanString | 'mixed' | undefined>;
  /**
   * Defines the total number of columns in a table, grid, or treegrid.
   * @see aria-colindex.
   */
  'aria-colcount'?: AtomOrValue<number | undefined>;
  /**
   * Defines an element's column index or position with respect to the total number of columns within a table, grid, or treegrid.
   * @see aria-colcount
   * @see aria-colspan.
   */
  'aria-colindex'?: AtomOrValue<number | undefined>;
  /**
   * Defines a human readable text alternative of aria-colindex.
   * @see aria-rowindextext.
   */
  'aria-colindextext'?: AtomOrValue<string | undefined>;
  /**
   * Defines the number of columns spanned by a cell or gridcell within a table, grid, or treegrid.
   * @see aria-colindex
   * @see aria-rowspan.
   */
  'aria-colspan'?: AtomOrValue<number | undefined>;
  /**
   * Identifies the element (or elements) whose contents or presence are controlled by the current element.
   * @see aria-owns.
   */
  'aria-controls'?: AtomOrValue<string | undefined>;
  /** Indicates the element that represents the current item within a container or set of related elements. */
  'aria-current'?: AtomOrValue<
    BooleanString | 'page' | 'step' | 'location' | 'date' | 'time' | undefined
  >;
  /**
   * Identifies the element (or elements) that describes the object.
   * @see aria-labelledby
   */
  'aria-describedby'?: AtomOrValue<string | undefined>;
  /**
   * Defines a string value that describes or annotates the current element.
   * @see related aria-describedby.
   */
  'aria-description'?: AtomOrValue<string | undefined>;
  /**
   * Identifies the element that provides a detailed, extended description for the object.
   * @see aria-describedby.
   */
  'aria-details'?: AtomOrValue<string | undefined>;
  /**
   * Indicates that the element is perceivable but disabled, so it is not editable or otherwise operable.
   * @see aria-hidden
   * @see aria-readonly.
   */
  'aria-disabled'?: AtomOrValue<BooleanString | undefined>;
  /**
   * Indicates what functions can be performed when a dragged object is released on the drop target.
   * @deprecated in ARIA 1.1
   */
  'aria-dropeffect'?: AtomOrValue<
    'none' | 'copy' | 'execute' | 'link' | 'move' | 'popup' | undefined
  >;
  /**
   * Identifies the element that provides an error message for the object.
   * @see aria-invalid
   * @see aria-describedby.
   */
  'aria-errormessage'?: AtomOrValue<string | undefined>;
  /** Indicates whether the element, or another grouping element it controls, is currently expanded or collapsed. */
  'aria-expanded'?: AtomOrValue<BooleanString | undefined>;
  /**
   * Identifies the next element (or elements) in an alternate reading order of content which, at the user's discretion,
   * allows assistive technology to override the general default of reading in document source order.
   */
  'aria-flowto'?: AtomOrValue<string | undefined>;
  /**
   * Indicates an element's "grabbed" state in a drag-and-drop operation.
   * @deprecated in ARIA 1.1
   */
  'aria-grabbed'?: AtomOrValue<BooleanString | undefined>;
  /** Indicates the availability and type of interactive popup element, such as menu or dialog, that can be triggered by an element. */
  'aria-haspopup'?: AtomOrValue<
    BooleanString | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog' | undefined
  >;
  /**
   * Indicates whether the element is exposed to an accessibility API.
   * @see aria-disabled.
   */
  'aria-hidden'?: AtomOrValue<BooleanString | undefined>;
  /**
   * Indicates the entered value does not conform to the format expected by the application.
   * @see aria-errormessage.
   */
  'aria-invalid'?: AtomOrValue<
    BooleanString | 'grammar' | 'spelling' | undefined
  >;
  /** Indicates keyboard shortcuts that an author has implemented to activate or give focus to an element. */
  'aria-keyshortcuts'?: AtomOrValue<string | undefined>;
  /**
   * Defines a string value that labels the current element.
   * @see aria-labelledby.
   */
  'aria-label'?: AtomOrValue<string | undefined>;
  /**
   * Identifies the element (or elements) that labels the current element.
   * @see aria-describedby.
   */
  'aria-labelledby'?: AtomOrValue<string | undefined>;
  /** Defines the hierarchical level of an element within a structure. */
  'aria-level'?: AtomOrValue<number | undefined>;
  /** Indicates that an element will be updated, and describes the types of updates the user agents, assistive technologies, and user can expect from the live region. */
  'aria-live'?: AtomOrValue<'off' | 'assertive' | 'polite' | undefined>;
  /** Indicates whether an element is modal when displayed. */
  'aria-modal'?: AtomOrValue<BooleanString | undefined>;
  /** Indicates whether a text box accepts multiple lines of input or only a single line. */
  'aria-multiline'?: AtomOrValue<BooleanString | undefined>;
  /** Indicates that the user may select more than one item from the current selectable descendants. */
  'aria-multiselectable'?: AtomOrValue<BooleanString | undefined>;
  /** Indicates whether the element's orientation is horizontal, vertical, or unknown/ambiguous. */
  'aria-orientation'?: AtomOrValue<'horizontal' | 'vertical' | undefined>;
  /**
   * Identifies an element (or elements) in order to define a visual, functional, or contextual parent/child relationship
   * between DOM elements where the DOM hierarchy cannot be used to represent the relationship.
   * @see aria-controls.
   */
  'aria-owns'?: AtomOrValue<string | undefined>;
  /**
   * Defines a short hint (a word or short phrase) intended to aid the user with data entry when the control has no value.
   * A hint could be a sample value or a brief description of the expected format.
   */
  'aria-placeholder'?: AtomOrValue<string | undefined>;
  /**
   * Defines an element's number or position in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.
   * @see aria-setsize.
   */
  'aria-posinset'?: AtomOrValue<number | undefined>;
  /**
   * Indicates the current "pressed" state of toggle buttons.
   * @see aria-checked
   * @see aria-selected.
   */
  'aria-pressed'?: AtomOrValue<BooleanString | 'mixed' | undefined>;
  /**
   * Indicates that the element is not editable, but is otherwise operable.
   * @see aria-disabled.
   */
  'aria-readonly'?: AtomOrValue<BooleanString | undefined>;
  /**
   * Indicates what notifications the user agent will trigger when the accessibility tree within a live region is modified.
   * @see aria-atomic.
   */
  'aria-relevant'?: AtomOrValue<
    | 'additions'
    | 'additions removals'
    | 'additions text'
    | 'all'
    | 'removals'
    | 'removals additions'
    | 'removals text'
    | 'text'
    | 'text additions'
    | 'text removals'
    | undefined
  >;
  /** Indicates that user input is required on the element before a form may be submitted. */
  'aria-required'?: AtomOrValue<BooleanString | undefined>;
  /** Defines a human-readable, author-localized description for the role of an element. */
  'aria-roledescription'?: AtomOrValue<string | undefined>;
  /**
   * Defines the total number of rows in a table, grid, or treegrid.
   * @see aria-rowindex.
   */
  'aria-rowcount'?: AtomOrValue<number | undefined>;
  /**
   * Defines an element's row index or position with respect to the total number of rows within a table, grid, or treegrid.
   * @see aria-rowcount
   * @see aria-rowspan.
   */
  'aria-rowindex'?: AtomOrValue<number | undefined>;
  /**
   * Defines a human readable text alternative of aria-rowindex.
   * @see aria-colindextext.
   */
  'aria-rowindextext'?: AtomOrValue<string | undefined>;
  /**
   * Defines the number of rows spanned by a cell or gridcell within a table, grid, or treegrid.
   * @see aria-rowindex
   * @see aria-colspan.
   */
  'aria-rowspan'?: AtomOrValue<number | undefined>;
  /**
   * Indicates the current "selected" state of various widgets.
   * @see aria-checked
   * @see aria-pressed.
   */
  'aria-selected'?: AtomOrValue<BooleanString | undefined>;
  /**
   * Defines the number of items in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.
   * @see aria-posinset.
   */
  'aria-setsize'?: AtomOrValue<number | undefined>;
  /** Indicates if items in a table or grid are sorted in ascending or descending order. */
  'aria-sort'?: AtomOrValue<
    'none' | 'ascending' | 'descending' | 'other' | undefined
  >;
  /** Defines the maximum allowed value for a range widget. */
  'aria-valuemax'?: AtomOrValue<number | undefined>;
  /** Defines the minimum allowed value for a range widget. */
  'aria-valuemin'?: AtomOrValue<number | undefined>;
  /**
   * Defines the current value for a range widget.
   * @see aria-valuetext.
   */
  'aria-valuenow'?: AtomOrValue<number | undefined>;
  /** Defines the human readable text alternative of aria-valuenow for a range widget. */
  'aria-valuetext'?: AtomOrValue<string | undefined>;
  role?: AtomOrValue<undefined | AriaRole>;
}

// All the WAI-ARIA 1.1 role attribute values from https://www.w3.org/TR/wai-aria-1.1/#role_definitions
export type AriaRole =
  | 'alert'
  | 'alertdialog'
  | 'application'
  | 'article'
  | 'banner'
  | 'button'
  | 'cell'
  | 'checkbox'
  | 'columnheader'
  | 'combobox'
  | 'complementary'
  | 'contentinfo'
  | 'definition'
  | 'dialog'
  | 'directory'
  | 'document'
  | 'feed'
  | 'figure'
  | 'form'
  | 'grid'
  | 'gridcell'
  | 'group'
  | 'heading'
  | 'img'
  | 'link'
  | 'list'
  | 'listbox'
  | 'listitem'
  | 'log'
  | 'main'
  | 'marquee'
  | 'math'
  | 'menu'
  | 'menubar'
  | 'menuitem'
  | 'menuitemcheckbox'
  | 'menuitemradio'
  | 'navigation'
  | 'none'
  | 'note'
  | 'option'
  | 'presentation'
  | 'progressbar'
  | 'radio'
  | 'radiogroup'
  | 'region'
  | 'row'
  | 'rowgroup'
  | 'rowheader'
  | 'scrollbar'
  | 'search'
  | 'searchbox'
  | 'separator'
  | 'slider'
  | 'spinbutton'
  | 'status'
  | 'switch'
  | 'tab'
  | 'table'
  | 'tablist'
  | 'tabpanel'
  | 'term'
  | 'textbox'
  | 'timer'
  | 'toolbar'
  | 'tooltip'
  | 'tree'
  | 'treegrid'
  | 'treeitem'
  | 'none presentation';
