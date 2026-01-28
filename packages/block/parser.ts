/**
 * Visitor interface for handling transformation of source passed to the {@linkcode BlockStreamParser}.
 */
export interface BlockStreamVisitor {
  /**
   * Called when a standard opening tag (`<name>`) is encountered.
   *
   * @param name The tag name.
   */
  onStartTagOpen(name: string): undefined;

  /** Called when a fragment opening tag (`<>`) is encountered. */
  onStartTagOpenFragment(): undefined;

  /**
   * Called when a dynamic opening tag (`<${Component}>`) is encountered.
   *
   * @param index The index in dynamic arguments representing the tag.
   */
  onStartTagOpenDynamic(index: number): undefined;

  /** Called when the attribute section of a start tag is finished. */
  onStartTagClose(): undefined;

  /** Called when a start tag is self closing. */
  onStartTagCloseEnd(): undefined;

  /**
   * Called when a standard closing tag (`</name>`) is encountered.
   *
   * @param name The tag name.
   */
  onEndTag(name: string): undefined;

  /** Called when a fragment closing tag (`</>`) is encountered. */
  onEndTagFragment(): undefined;

  /**
   * Called when a standard attribute (`<tag name="value">`) is encountered.
   *
   * @param name The attribute name.
   * @param value The literal string value of the attribute.
   */
  onAttribute(name: string, value: string): undefined;

  /**
   * Called when a boolean attribute (`<tag name>`) is encountered.
   *
   * @param name The attribute name.
   */
  onAttributeBoolean(name: string): undefined;

  /**
   * Called when a dynamic attribute (`<tag name=${value}>`) is encountered.
   *
   * @param name The attribute name.
   * @param index The index in dynamic arguments representing the value.
   */
  onAttributeDynamic(name: string, index: number): undefined;

  /**
   * Called when static text content is encountered between tags.
   *
   * @param text The literal string content.
   */
  onContentText(text: string): undefined;

  /**
   * Called when dynamic content (`<tag>${value}</tag>`) is encountered.
   *
   * @param index The index in dynamic arguments representing the content.
   */
  onContentDynamic(index: number): undefined;

  /** Called when the parser successfully finishes parsing the block. */
  onFinish(): undefined;

  /** Called when the parser state is reset. */
  onReset(): undefined;

  /**
   * Called when a parsing error occurs.
   *
   * @param cause The error or reason for the failure.
   */
  onError(cause: unknown): undefined; // TODO: Strongly type errors
}

/**
 * Provides {@linkcode BlockStreamParser} cursor information.
 */
interface BlockStreamCursorInfo {
  /** The index of chunk which the cursor was operating on. */
  chunkIndex: number;
  /** The length of the chunk. */
  chunkLength: number;
  /** The cursor's character offset within the chunk. */
  charOffset: number;
}

const CODE_POINT_TAB = 0x09; // "\t"
const CODE_POINT_LINE_FEED = 0x0a; // "\n"
const CODE_POINT_CARRIAGE_RETURN = 0x0d; // "\r"
const CODE_POINT_SPACE = 0x20; // " "
const CODE_POINT_DOUBLE_QUOTE = 0x22; // `"`
const CODE_POINT_DOLLAR_SIGN = 0x24; // "$"
const CODE_POINT_SINGLE_QUOTE = 0x27; // "'"
const CODE_POINT_HYPHEN_MINUS = 0x2d; // "-"
const CODE_POINT_PERIOD = 0x2e; // "."
const CODE_POINT_FORWARD_SLASH = 0x2f; // "/"
const CODE_POINT_0 = 0x30; // "0";
const CODE_POINT_9 = 0x39; // "9";
const CODE_POINT_COLON = 0x3a; // ":"
const CODE_POINT_LESS_THAN = 0x3c; // "<"
const CODE_POINT_EQUALS = 0x3d; // "="
const CODE_POINT_GREATER_THAN = 0x3e; // ">"
const CODE_POINT_UPPER_A = 0x41; // "A";
const CODE_POINT_UPPER_Z = 0x5a; // "Z";
const CODE_POINT_UNDERSCORE = 0x5f; // "_"
const CODE_POINT_LOWER_A = 0x61; // "a";
const CODE_POINT_LOWER_Z = 0x7a; // "z";

const PARSER_STATE_ERROR = -1;
const PARSER_STATE_CONTENT = 0;
const PARSER_STATE_TAG_OPEN = 1;
const PARSER_STATE_TAG_NAME = 2;
const PARSER_STATE_TAG_ATTRIBUTES = 3;
const PARSER_STATE_TAG_EMPTY = 4;
const PARSER_STATE_ATTRIBUTE_NAME = 5;
const PARSER_STATE_ATTRIBUTE_BEFORE_VALUE = 6;
const PARSER_STATE_ATTRIBUTE_VALUE = 7;
const PARSER_STATE_END_TAG = 8;
const PARSER_STATE_END_TAG_NAME = 9;

type ParserState =
  | typeof PARSER_STATE_ERROR
  | typeof PARSER_STATE_CONTENT
  | typeof PARSER_STATE_TAG_OPEN
  | typeof PARSER_STATE_TAG_NAME
  | typeof PARSER_STATE_TAG_ATTRIBUTES
  | typeof PARSER_STATE_TAG_EMPTY
  | typeof PARSER_STATE_ATTRIBUTE_NAME
  | typeof PARSER_STATE_ATTRIBUTE_BEFORE_VALUE
  | typeof PARSER_STATE_ATTRIBUTE_VALUE
  | typeof PARSER_STATE_END_TAG
  | typeof PARSER_STATE_END_TAG_NAME;

const ERROR_MESSAGES = {
  InvalidTagOpenCharacter: "",
  InvalidTagNameCharacter: "",
};

type ParserErrorType = keyof typeof ERROR_MESSAGES;

export class BlockStreamParserError extends Error {
  constructor(type: ParserErrorType) {
    super(ERROR_MESSAGES[type], { cause: { type } });
    this.name = "BlockStreamParserError";
  }
}

/**
 * A streaming parser designed to process chunked template blocks by delegating transformation steps to a visitor.
 * The parser handles orchestration of raw text chunks and dynamic placeholders (or holes, identified by an index).
 * Designed for re-use by resetting internal state after a block is processed.
 */
export class BlockStreamParser {
  #visitor: BlockStreamVisitor;
  #isProcessing = false;
  #state: ParserState = PARSER_STATE_CONTENT;
  #cursorChunkIndex: number = 0;
  #cursorChunkLength: number = 0;
  #cursorCharOffset: number = 0;
  #primaryBuffer = "";
  #secondaryBuffer = "";
  #savedCodePoint = -1;
  #shouldThrowOnError = true;

  /**
   * Constructs a new instance of the BlockStreamParser.
   *
   * @param visitor An object implementing the {@link BlockStreamVisitor} interface to handle parsing steps.
   */
  constructor(visitor: BlockStreamVisitor) {
    this.#visitor = visitor;
  }

  /**
   * Retrieves parser's cursor information.
   *
   * @returns A object containing cursor information.
   */
  getCursorInfo(): BlockStreamCursorInfo {
    return {
      chunkIndex: this.#cursorChunkIndex,
      chunkLength: this.#cursorChunkLength,
      charOffset: this.#cursorCharOffset,
    };
  }

  /**
   * Processes the chunk.
   *
   * @param chunk The chunk to process.
   */
  processChunk(chunk: string): undefined {
    if (this.#isProcessing) {
      throw new Error("Parsing in progress");
    }
    if (chunk.length === 0) {
      this.#cursorChunkIndex++;
      return;
    }
    this.#isProcessing = true;
    const iEnd = this.#cursorChunkLength = chunk.length;
    let i = this.#cursorCharOffset = 0;
    try {
      while (i < iEnd) {
        this.#processCodePoint(chunk.codePointAt(i)!);
        i++;
        this.#cursorCharOffset = i;
      }
    } catch (cause) {
      this.#enterErrorState();
      throw new Error("Parsing error", { cause });
    } finally {
      this.#cursorChunkIndex++;
      this.#isProcessing = false;
    }
  }

  /**
   * Adds dynamic hole.
   * Used for constructing template blocks where arguments can be passed to fill the dynamic holes by index.
   *
   * @param index The index of specific argument to fill the dynamic hole.
   */
  addDynamicHole(index: number): undefined {
    if (this.#isProcessing) {
      throw new Error("Parsing in progress");
    }
    this.#isProcessing = true;
    this.#cursorChunkLength = -1;
    this.#cursorCharOffset = 0;
    try {
      switch (this.#state) {
        case PARSER_STATE_TAG_OPEN:
          this.#visitor.onStartTagOpenDynamic(index);
          this.#state = PARSER_STATE_TAG_ATTRIBUTES;
          break;
        case PARSER_STATE_ATTRIBUTE_BEFORE_VALUE:
          if (this.#savedCodePoint === CODE_POINT_EQUALS) {
            this.#visitor.onAttributeDynamic(this.#primaryBuffer, index);
            this.#primaryBuffer = "";
            this.#state = PARSER_STATE_TAG_ATTRIBUTES;
          } else {
            this.#reportError(new Error("Unsupported placement of hole"));
          }
          break;
        case PARSER_STATE_CONTENT:
          if (this.#primaryBuffer) {
            this.#visitor.onContentText(this.#primaryBuffer);
            this.#primaryBuffer = "";
          }
          this.#visitor.onContentDynamic(index);
          break;
        default:
          this.#reportError(new Error("Unsupported placement of hole"));
          break;
      }
    } catch (cause) {
      this.#enterErrorState();
      throw new Error("Parsing error", { cause });
    } finally {
      this.#cursorChunkIndex++;
      this.#isProcessing = false;
    }
  }

  /** Finishes parsing the block. */
  finish(): undefined {
    if (this.#isProcessing) {
      throw new Error("Parsing in progress");
    } else if (this.#state === PARSER_STATE_ERROR) {
      throw new Error("Cannot finish when in error state");
    } else if (this.#state === PARSER_STATE_CONTENT) {
      if (this.#primaryBuffer) {
        this.#visitor.onContentText(this.#primaryBuffer);
        this.#primaryBuffer = "";
      }
    } else {
      this.#reportError(new Error("Unexpected end of block"));
    }
    this.#visitor.onFinish();
  }

  /** Resets internal state to begin a new block. */
  reset(): undefined {
    if (this.#isProcessing) {
      throw new Error("Parsing in progress");
    }
    this.#state = PARSER_STATE_CONTENT;
    this.#cursorChunkIndex = 0;
    this.#cursorCharOffset = 0;
    this.#primaryBuffer = "";
    this.#secondaryBuffer = "";
    this.#savedCodePoint = -1;
    this.#visitor.onReset();
  }

  #reportError(cause: unknown): undefined {
    // TODO: Strongly type errors
    this.#visitor.onError(cause);
    if (this.#shouldThrowOnError) {
      throw cause;
    }
  }

  #enterErrorState(): undefined {
    this.#state = PARSER_STATE_ERROR;
    this.#cursorChunkIndex = 0;
    this.#cursorCharOffset = 0;
    this.#primaryBuffer = "";
    this.#secondaryBuffer = "";
    this.#savedCodePoint = -1;
  }

  #processCodePoint(codePoint: number): undefined {
    switch (this.#state) {
      case PARSER_STATE_CONTENT:
        if (codePoint === CODE_POINT_LESS_THAN) {
          if (this.#primaryBuffer) {
            this.#visitor.onContentText(this.#primaryBuffer);
            this.#primaryBuffer = "";
          }
          this.#state = PARSER_STATE_TAG_OPEN;
        } else {
          this.#primaryBuffer += String.fromCodePoint(codePoint);
        }
        return;
      case PARSER_STATE_TAG_OPEN:
        if (isNameStartChar(codePoint)) {
          this.#primaryBuffer = String.fromCodePoint(codePoint);
          this.#state = PARSER_STATE_TAG_NAME;
        } else if (codePoint === CODE_POINT_FORWARD_SLASH) {
          this.#state = PARSER_STATE_END_TAG;
        } else if (codePoint === CODE_POINT_GREATER_THAN) {
          this.#visitor.onStartTagOpenFragment();
          this.#visitor.onStartTagClose();
          this.#state = PARSER_STATE_CONTENT;
        } else {
          this.#reportError(new Error("Invalid character"));
        }
        return;
      case PARSER_STATE_TAG_NAME:
        if (isNameChar(codePoint)) {
          this.#primaryBuffer += String.fromCodePoint(codePoint);
        } else if (isWhiteSpace(codePoint)) {
          this.#visitor.onStartTagOpen(this.#primaryBuffer);
          this.#primaryBuffer = "";
          this.#state = PARSER_STATE_TAG_ATTRIBUTES;
        } else if (codePoint === CODE_POINT_GREATER_THAN) {
          this.#visitor.onStartTagOpen(this.#primaryBuffer);
          this.#primaryBuffer = "";
          this.#visitor.onStartTagClose();
          this.#state = PARSER_STATE_CONTENT;
        } else if (codePoint === CODE_POINT_FORWARD_SLASH) {
          this.#visitor.onStartTagOpen(this.#primaryBuffer);
          this.#primaryBuffer = "";
          this.#state = PARSER_STATE_TAG_EMPTY;
        } else {
          this.#reportError(new Error("Invalid character"));
        }
        return;
      case PARSER_STATE_TAG_ATTRIBUTES:
        if (isNameStartChar(codePoint)) {
          this.#primaryBuffer = String.fromCodePoint(codePoint);
          this.#state = PARSER_STATE_ATTRIBUTE_NAME;
        } else if (isWhiteSpace(codePoint)) {
          return;
        } else if (codePoint === CODE_POINT_GREATER_THAN) {
          this.#visitor.onStartTagClose();
          this.#state = PARSER_STATE_CONTENT;
        } else if (codePoint === CODE_POINT_FORWARD_SLASH) {
          this.#state = PARSER_STATE_TAG_EMPTY;
        } else {
          this.#reportError(new Error("Invalid character"));
        }
        return;
      case PARSER_STATE_TAG_EMPTY:
        if (codePoint === CODE_POINT_GREATER_THAN) {
          this.#visitor.onStartTagCloseEnd();
          this.#state = PARSER_STATE_CONTENT;
        } else {
          this.#reportError(new Error("Invalid character"));
        }
        return;
      case PARSER_STATE_ATTRIBUTE_NAME:
        if (isNameChar(codePoint)) {
          this.#primaryBuffer += String.fromCodePoint(codePoint);
        } else if (codePoint === CODE_POINT_EQUALS) {
          this.#savedCodePoint = codePoint;
          this.#state = PARSER_STATE_ATTRIBUTE_BEFORE_VALUE;
        } else if (isWhiteSpace(codePoint)) {
          this.#state = PARSER_STATE_ATTRIBUTE_BEFORE_VALUE;
        } else if (codePoint === CODE_POINT_GREATER_THAN) {
          this.#visitor.onAttributeBoolean(this.#primaryBuffer);
          this.#primaryBuffer = "";
          this.#visitor.onStartTagClose();
          this.#state = PARSER_STATE_CONTENT;
        } else if (codePoint === CODE_POINT_FORWARD_SLASH) {
          this.#visitor.onAttributeBoolean(this.#primaryBuffer);
          this.#primaryBuffer = "";
          this.#state = PARSER_STATE_TAG_EMPTY;
        } else {
          this.#reportError(new Error("Invalid character"));
        }
        return;
      case PARSER_STATE_ATTRIBUTE_BEFORE_VALUE:
        if (isWhiteSpace(codePoint)) {
          return;
        }
        if (this.#savedCodePoint === -1) {
          if (codePoint === CODE_POINT_EQUALS) {
            this.#savedCodePoint = codePoint;
          } else if (isNameStartChar(codePoint)) {
            this.#visitor.onAttributeBoolean(this.#primaryBuffer);
            this.#primaryBuffer = "";
            this.#savedCodePoint = -1;
            this.#state = PARSER_STATE_ATTRIBUTE_NAME;
          } else if (codePoint === CODE_POINT_GREATER_THAN) {
            this.#visitor.onAttributeBoolean(this.#primaryBuffer);
            this.#primaryBuffer = "";
            this.#savedCodePoint = -1;
            this.#visitor.onStartTagClose();
            this.#state = PARSER_STATE_CONTENT;
          } else if (codePoint === CODE_POINT_FORWARD_SLASH) {
            this.#visitor.onAttributeBoolean(this.#primaryBuffer);
            this.#primaryBuffer = "";
            this.#savedCodePoint = -1;
            this.#state = PARSER_STATE_TAG_EMPTY;
          } else {
            this.#reportError(new Error("Invalid character"));
          }
          return;
        }
        if (
          codePoint === CODE_POINT_DOUBLE_QUOTE ||
          codePoint === CODE_POINT_SINGLE_QUOTE
        ) {
          this.#savedCodePoint = codePoint;
          this.#state = PARSER_STATE_ATTRIBUTE_VALUE;
        } else {
          this.#reportError(new Error("Invalid character"));
        }
        return;
      case PARSER_STATE_ATTRIBUTE_VALUE:
        if (codePoint === this.#savedCodePoint) {
          this.#visitor.onAttribute(this.#primaryBuffer, this.#secondaryBuffer);
          this.#primaryBuffer = "";
          this.#secondaryBuffer = "";
          this.#savedCodePoint = -1;
          this.#state = PARSER_STATE_TAG_ATTRIBUTES;
        } else {
          this.#secondaryBuffer += String.fromCodePoint(codePoint);
        }
        return;
      case PARSER_STATE_END_TAG:
        if (isNameStartChar(codePoint)) {
          this.#primaryBuffer = String.fromCodePoint(codePoint);
          this.#state = PARSER_STATE_END_TAG_NAME;
        } else if (codePoint === CODE_POINT_GREATER_THAN) {
          this.#visitor.onEndTagFragment();
          this.#state = PARSER_STATE_CONTENT;
        } else if (isWhiteSpace(codePoint)) {
          return;
        } else {
          this.#reportError(new Error("Invalid character"));
        }
        return;
      case PARSER_STATE_END_TAG_NAME:
        if (this.#savedCodePoint === CODE_POINT_GREATER_THAN) {
          if (codePoint === CODE_POINT_GREATER_THAN) {
            this.#visitor.onEndTag(this.#primaryBuffer);
            this.#primaryBuffer = "";
            this.#state = PARSER_STATE_CONTENT;
          } else if (isWhiteSpace(codePoint)) {
            return;
          } else {
            this.#reportError(new Error("Invalid character"));
          }
          return;
        }
        if (isNameChar(codePoint)) {
          this.#primaryBuffer += String.fromCodePoint(codePoint);
        } else if (codePoint === CODE_POINT_GREATER_THAN) {
          this.#visitor.onEndTag(this.#primaryBuffer);
          this.#primaryBuffer = "";
          this.#state = PARSER_STATE_CONTENT;
        } else if (isWhiteSpace(codePoint)) {
          this.#savedCodePoint = CODE_POINT_GREATER_THAN;
        } else {
          this.#reportError(new Error("Invalid character"));
        }
        return;
    }
  }
}

function isNameStartChar(codePoint: number): boolean {
  return (
    (codePoint >= CODE_POINT_LOWER_A && codePoint <= CODE_POINT_LOWER_Z) ||
    (codePoint >= CODE_POINT_UPPER_A && codePoint <= CODE_POINT_UPPER_Z) ||
    codePoint === CODE_POINT_DOLLAR_SIGN ||
    codePoint === CODE_POINT_UNDERSCORE ||
    codePoint === CODE_POINT_COLON
  );
}

function isNameChar(codePoint: number): boolean {
  return (
    (codePoint >= CODE_POINT_LOWER_A && codePoint <= CODE_POINT_LOWER_Z) ||
    (codePoint >= CODE_POINT_UPPER_A && codePoint <= CODE_POINT_UPPER_Z) ||
    codePoint === CODE_POINT_DOLLAR_SIGN ||
    codePoint === CODE_POINT_UNDERSCORE ||
    codePoint === CODE_POINT_COLON ||
    codePoint === CODE_POINT_HYPHEN_MINUS ||
    codePoint === CODE_POINT_PERIOD ||
    (codePoint >= CODE_POINT_0 && codePoint <= CODE_POINT_9)
  );
}

function isWhiteSpace(codePoint: number): boolean {
  return (
    codePoint === CODE_POINT_SPACE || codePoint === CODE_POINT_LINE_FEED ||
    codePoint === CODE_POINT_TAB || codePoint === CODE_POINT_CARRIAGE_RETURN
  );
}
