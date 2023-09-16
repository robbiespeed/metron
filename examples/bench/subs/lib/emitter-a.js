const cleanItems = new Set();

function clean() {
  for (const emitter of cleanItems) {
    emitter.subscribers = emitter.subscribers.filter(
      (s) => s.handler !== undefined
    );
  }
  cleanItems.clear();
  canClean = true;
}

let canClean = true;

export class Emitter {
  subscribers = [];
  subscribe(handler) {
    const sub = { handler };
    this.subscribers.push(sub);
    return () => {
      sub.handler = undefined;
      cleanItems.add(this);
      if (canClean) {
        queueMicrotask(clean);
      }
    };
  }
  send(msg) {
    for (const sub of this.subscribers) {
      try {
        sub.handler?.(msg);
      } catch (err) {
        console.error(err);
      }
    }
  }
}
