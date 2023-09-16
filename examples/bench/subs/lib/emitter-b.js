export class Emitter {
  subscribersHead = undefined;
  subscribe(handler) {
    const subscribersHead = this.subscribersHead;
    let sub = { prev: undefined, handler, next: subscribersHead };
    if (subscribersHead) {
      subscribersHead.prev = sub;
    }
    this.subscribersHead = sub;

    return () => {
      if (sub) {
        if (sub.prev) {
          sub.prev = sub.next;
        } else {
          this.subscribersHead = sub.next;
        }
        sub = undefined;
      }
    };
  }
  send(msg) {
    let next = this.subscribersHead;
    while (next) {
      try {
        next.handler(msg);
      } catch (err) {
        console.error(err);
      }
      next = next.next;
    }
  }
}
