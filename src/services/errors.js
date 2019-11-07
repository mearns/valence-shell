export function causedBy(error, cause, props = {}) {
    error.cause = cause;
    error._stack = error.stack;
    error.stack = error.stack + `\n  caused by: ${cause.stack}`;
    Object.entries(props).forEach(([k, v]) => {
        error[k] = v;
    });
    return error;
}
