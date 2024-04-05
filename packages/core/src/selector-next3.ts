import { ORB, type Atom } from './atom.js';
import { createReceiverOrb } from './orb.js';
import { state } from './state.js';

export interface Selector<TIn, TOut> {
  (value: TIn): Atom<TOut>;
}

export function createSelector<TIn, TOut>(
  input: Atom<TIn>,
  mapper: (isSelected: boolean) => TOut
): Selector<TIn, TOut> {
  const weakAtoms = new Map<TIn, WeakRef<Atom<TOut>>>();
  const setters = new Map<TIn, (out: TOut) => undefined>();
  const registry = new FinalizationRegistry((value: TIn) => {
    weakAtoms.delete(value);
    setters.delete(value);

    // keep receiver alive for as long as selector and all select atoms are alive.
    receiver.isReceiver;
  });

  let store = input.unwrap();

  const receiver = createReceiverOrb(
    undefined,
    () => {
      const nextValue = input.unwrap();
      if (store === nextValue) {
        return false;
      }

      setters.get(store)?.(mapper(false));
      setters.get(nextValue)?.(mapper(true));
      store = nextValue;

      return false;
    },
    [input[ORB]]
  );

  return function selector(value: TIn): Atom<TOut> {
    const selectedAtom = weakAtoms.get(value)?.deref();
    if (selectedAtom !== undefined) {
      return selectedAtom;
    }

    const [selectionOut, setSelectionOut] = state(mapper(store === value));
    weakAtoms.set(value, new WeakRef(selectionOut));
    setters.set(value, setSelectionOut);
    registry.register(selectionOut, value);

    return selectionOut;
  };
}
