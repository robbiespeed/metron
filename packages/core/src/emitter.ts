import { emitterKey, type Particle } from './particle.js';
import { scheduleCleanup } from './schedulers.js';

// TODO: fix types and allow emitters that pass down data to connected children

export interface Disposer {
  (): void;
}

export interface EmitterConnection<TEmitData = unknown> {
  // TODO: test out making this a static weakRef (created and stored on self)
  // Could reduce the need for cleanup registry, and make GC happen sooner
  child?: WeakRef<Emitter<TEmitData>>;
  childId: string;
  parent: Emitter<TEmitData>;
  isConnected: boolean;
}

export interface EmitterLeaf<TEmitData = unknown> {
  handler?: EmitHandler<TEmitData>;
}

export type EmitHandler<TEmitData> = (data: TEmitData) => void;

export type EmitterUpdateHandler<TEmitData> = (
  send: (data: TEmitData) => void
) => void;

let freshArray: any[] = [];
let freshRecord: Record<any, any> = {};
let nextId = 0n;

let clockTick = 0;

const updateStack: [Emitter<any>, unknown][] = [];

// TODO: split internal emitter methods (stabilize, update, send, etc) into private context accessible through optional constructor setup method
// find better names for some methods

// TODO: test different types of Records/Maps for connections. Map<WR, C>, Map<bigInt, C>, (Map | Record)<number, C>, (Map | Record)<num string,C>, Record<prefixed num string,C>

export class Emitter<TEmitData = void> implements Particle<TEmitData> {
  private _weak: undefined | WeakRef<this>;
  private readonly id = `${nextId++}`;
  private lastTick = 0;
  private _isStable = true;
  private activeParentConnectionCount = 0;
  private canScheduleCleanChildren = true;
  private canScheduleCleanLeaves = true;
  private childConnectionRecord:
    | undefined
    | Record<string, EmitterConnection<any>>;
  private childConnections: undefined | EmitterConnection<any>[];
  private staticParentConnections: undefined | EmitterConnection<any>[] =
    undefined;
  private parentConnectionRecord:
    | undefined
    | Record<string, EmitterConnection<any>>;
  private parentConnections: undefined | EmitterConnection<any>[];
  // TODO:
  // private flatChildConnections: undefined | Connection[];
  private subscriptionLeaves: undefined | EmitterLeaf<TEmitData>[];

  private cleanChildren = () => {
    const oldChildConnections = this.childConnections;
    if (oldChildConnections !== undefined) {
      const freshChildConnections: EmitterConnection<any>[] = freshArray;
      const freshChildConnectionRecord: Record<
        string,
        EmitterConnection<any>
      > = freshRecord;
      for (let i = oldChildConnections.length - 1; i >= 0; i--) {
        const connection = oldChildConnections[i]!;
        if (connection.isConnected) {
          freshChildConnectionRecord[connection.childId] = connection;
          freshChildConnections.push(connection);
        }
      }
      if (freshChildConnections.length) {
        freshArray = [];
        freshRecord = {};
        this.childConnections = freshChildConnections;
        this.childConnectionRecord = freshChildConnectionRecord;
      } else {
        this.childConnections = undefined;
        this.childConnectionRecord = undefined;
      }
    }
  };

  private cleanLeaves = () => {
    const oldSubLeaves = this.subscriptionLeaves;
    if (oldSubLeaves !== undefined) {
      let newSubLeaves: undefined | EmitterLeaf<TEmitData>[];
      for (let i = oldSubLeaves.length - 1; i >= 0; i--) {
        const leaf = oldSubLeaves[i]!;
        if (leaf.handler) {
          (newSubLeaves ??= []).push(leaf);
        }
      }
      this.subscriptionLeaves = newSubLeaves;
    }

    this.canScheduleCleanLeaves = true;
  };

  private innerSend = (data: TEmitData) => {
    const { subscriptionLeaves } = this;
    if (subscriptionLeaves !== undefined) {
      for (let i = subscriptionLeaves.length - 1; i >= 0; i--) {
        subscriptionLeaves[i]!.handler?.(data);
      }
    }
  };

  clear = () => {
    this._isStable = false;
    this.activeParentConnectionCount = 0;
    const { parentConnections, staticParentConnections } = this;
    this.cleanChildren();
    this.cleanLeaves();
    this.parentConnectionRecord = undefined;
    if (parentConnections !== undefined) {
      this.parentConnections = undefined;
      for (const connection of parentConnections) {
        connection.child = undefined;
        connection.isConnected = false;
        connection.parent.scheduleCleanChildren();
      }
    }
    if (staticParentConnections !== undefined) {
      this.staticParentConnections = undefined;
      for (const connection of staticParentConnections) {
        connection.child = undefined;
        connection.isConnected = false;
        connection.parent.scheduleCleanChildren();
      }
    }
  };

  connectToParent = (
    parent: Emitter<TEmitData extends undefined | void ? any : TEmitData>
  ): void => {
    const parentConnectionRecord = (this.parentConnectionRecord ??= {});
    const existingConnection = parentConnectionRecord[parent.id];

    if (existingConnection !== undefined) {
      if (existingConnection.child !== undefined) {
        return;
      }

      existingConnection.child = this.getWeakRef();
      existingConnection.isConnected = true;
      this.activeParentConnectionCount++;

      return;
    }

    const parentConnections = (this.parentConnections ??= []);

    const parentChildConnectionRecord = (parent.childConnectionRecord ??= {});
    const existingParentChildConnection = parentChildConnectionRecord[this.id];

    if (existingParentChildConnection !== undefined) {
      existingParentChildConnection.child = this.getWeakRef();
      existingParentChildConnection.isConnected = true;

      parentConnections.push(existingParentChildConnection);

      this.activeParentConnectionCount++;

      return;
    }

    const connection =
      (parentChildConnectionRecord[this.id] =
      parentConnectionRecord[parent.id] =
        {
          childId: this.id,
          child: this.getWeakRef(),
          parent,
          isConnected: true,
        });

    parentConnections.push(connection);

    const parentChildConnections = (parent.childConnections ??= []);
    parentChildConnections.push(connection);

    this.activeParentConnectionCount++;
  };

  connectStaticToParent = (
    parent: Emitter<TEmitData extends undefined | void ? any : TEmitData>
  ): void => {
    const staticParentConnections = (this.staticParentConnections ??= []);

    const connection = {
      childId: this.id,
      child: this.getWeakRef(),
      parent,
      isConnected: true,
    };
    staticParentConnections.push(connection);
    const parentChildConnections = parent.childConnections;
    if (parentChildConnections !== undefined) {
      parentChildConnections.push(connection);
    } else {
      parent.childConnections = [connection];
    }
  };

  stabilize = (): void => {
    if (this._isStable) {
      return;
    }

    const { parentConnections, activeParentConnectionCount } = this;
    const parentConnectionCount = parentConnections?.length;
    const shouldCleanParentConnections =
      parentConnectionCount !== activeParentConnectionCount;

    if (shouldCleanParentConnections) {
      if (activeParentConnectionCount === 0) {
        this.parentConnections = undefined;
        for (let i = 0; i < parentConnectionCount!; i++) {
          const connection = parentConnections![i]!;
          connection.isConnected = false;
          connection.child = undefined;
          const parent = connection.parent;
          if (parent.childConnections !== undefined) {
            parent.scheduleCleanChildren();
          }
        }
      } else {
        const freshParentConnections: EmitterConnection<any>[] = freshArray;
        const freshParentConnectionRecord: Record<
          string,
          EmitterConnection<any>
        > = freshRecord;
        for (let i = 0; i < parentConnectionCount!; i++) {
          const connection = parentConnections![i]!;
          const child = connection.child;
          const parent = connection.parent;
          if (child !== undefined) {
            freshParentConnectionRecord[parent.id] = connection;
            freshParentConnections.push(connection);
            continue;
          }
          connection.isConnected = false;
          if (parent.childConnections !== undefined) {
            parent.scheduleCleanChildren();
          }
        }
        if (freshParentConnections.length) {
          freshArray = [];
          freshRecord = {};
          this.parentConnections = freshParentConnections;
          this.parentConnectionRecord = freshParentConnectionRecord;
        } else {
          this.parentConnections = undefined;
          this.parentConnectionRecord = undefined;
        }
      }
    }

    this._isStable = true;
  };

  subscribe = (handler: EmitHandler<TEmitData>): Disposer => {
    const leaf: EmitterLeaf<TEmitData> = { handler };
    (this.subscriptionLeaves ??= []).push(leaf);

    return () => {
      leaf.handler = undefined;
      this.scheduleCleanLeaves();
    };
  };

  updateHandler?: EmitterUpdateHandler<TEmitData>;

  constructor(updateHandler?: EmitterUpdateHandler<TEmitData>) {
    this.updateHandler = updateHandler;
  }

  private innerUpdate(data: TEmitData) {
    this.lastTick = clockTick;
    this._isStable = false;

    this.activeParentConnectionCount = 0;

    const { parentConnections, updateHandler, innerSend } = this;

    if (parentConnections !== undefined) {
      for (let i = parentConnections.length - 1; i >= 0; i--) {
        parentConnections[i]!.child = undefined;
      }
    }

    if (updateHandler === undefined) {
      innerSend(data);
    } else {
      updateHandler(innerSend);
    }
  }

  private scheduleCleanChildren() {
    if (this.canScheduleCleanChildren) {
      scheduleCleanup(this.cleanChildren);
    }
  }

  private scheduleCleanLeaves() {
    if (this.canScheduleCleanLeaves) {
      this.canScheduleCleanLeaves = false;
      scheduleCleanup(this.cleanLeaves);
    }
  }

  getWeakRef() {
    return (this._weak ??= new WeakRef(this));
  }

  get isStable() {
    return this._isStable;
  }

  get [emitterKey]() {
    return this;
  }

  private static send<TEmitData = unknown>(
    this: Emitter<TEmitData>,
    data: TEmitData
  ) {
    if (updateStack.length) {
      updateStack.push([this, data]);
      return;
    }

    // TODO: Move inside if statement below
    clockTick++;
    this.innerUpdate(data);

    const childConnections = this.childConnections;
    if (childConnections !== undefined) {
      let connections = childConnections;
      let stack: EmitterConnection<unknown>[][] = [];
      let i = connections.length - 1;
      while (i >= 0) {
        const child = connections[i]!.child?.deref();
        if (child !== undefined && child.lastTick !== clockTick) {
          child.innerUpdate(data);
          const innerChildConnections = child.childConnections;
          if (innerChildConnections !== undefined) {
            if (i > 0) {
              stack.push(innerChildConnections);
            } else {
              connections = innerChildConnections;
              i = connections.length - 1;
              continue;
            }
          }
        }

        i--;
        if (i < 0) {
          const nextConnections = stack?.pop();
          if (nextConnections !== undefined) {
            connections = nextConnections;
            i = connections.length - 1;
          }
        }
      }
    }

    while (updateStack.length) {
      const [emitter, data] = updateStack.pop()!;
      Emitter.send.call(emitter, data);
    }
  }
  static withUpdater<TEmitData = void>(
    updateHandler?: EmitterUpdateHandler<TEmitData>
  ): {
    emitter: Emitter<TEmitData>;
    update: (data: TEmitData) => void;
  } {
    const emitter = new Emitter<TEmitData>(updateHandler);
    return {
      emitter,
      update: Emitter.send.bind(emitter as any),
    };
  }
}
