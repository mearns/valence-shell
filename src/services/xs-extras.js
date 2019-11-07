import xs from "xstream";

export function tap(f) {
    const handler = typeof f === "function" ? { next: f } : f;
    return stream => {
        let subscription;
        const source = {
            start(listener) {
                subscription = stream.subscribe({
                    async next(event) {
                        handler.next && (await handler.next(event));
                        listener.next(event);
                    },
                    async error(e) {
                        handler.error && (await handler.error(e));
                        listener.error(e);
                    },
                    async complete() {
                        handler.complete && (await handler.complete());
                        listener.complete();
                    }
                });
            },

            stop() {
                if (subscription) {
                    subscription.unsubscribe();
                    subscription = null;
                }
            }
        };
        return xs.create(source);
    };
}
