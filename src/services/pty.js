import path from "path";
import { spawn } from "child_process";
import xs from "xstream";

export default function pty(commandArgs, spawnOptions) {
    const pty = new Pty(commandArgs, spawnOptions);
    return {
        stream: pty.stream,
        stdin: pty.stdin,
        signal: pty.signal
    };
}

const COMMANDS_WITH_INPUT = Object.freeze(new Set(["O", "E", "I", "C"]));
const COMMS_COMMAND_MNEU = "C";

function commandHasInput(mneu) {
    return COMMANDS_WITH_INPUT.has(mneu);
}

const PTY_COMMAND_STREAM_NAMES = Object.freeze({
    O: "stdout",
    E: "stderr",
    I: "stdin",
    D: "debug"
});

const PTY_COMMAND_PATH = path.resolve(__dirname, "../../lib/pty/pty");

function createStream() {
    let listener;
    const producer = {
        start: providedListener => {
            listener = providedListener;
        },
        stop: () => {}
    };
    const stream = xs.create(producer);
    // Ensure our producer starts. We'll do it live.
    stream.addListener({ next() {} });
    return { listener, stream };
}

class Pty {
    constructor(commandArgs, spawnOptions) {
        this._cmdBuffer = "";
        this._pendingCommand = null;
        this._commandInputBuffer = [];
        this._bufferedInputLength = 0;
        const { stream, listener } = createStream();
        this.stream = stream;
        this.listener = listener;

        const process = spawn(PTY_COMMAND_PATH, commandArgs, spawnOptions);

        this.stdin = process.stdin;
        this.signal = process.kill.bind(process);

        process.on("error", error => {
            let errorMessage = `Error launching pty: ${error.message}`;
            if (error.code === "ENOENT") {
                errorMessage = `${error.path}: command not found`;
            } else if (error.code === "EACCES") {
                errorMessage = `${error.path}: Permission denied`;
            }
            const ce = Object.create(error);
            ce.message = errorMessage;
            ce.stack = error.stack;
            ce.name = error.name;
            this.listener.error(ce);
        });

        process.stdout.on("data", chunk => this.append(chunk));

        process.stdout.on("close", chunk => {
            if (chunk) {
                this.append(chunk);
            }
            this.flush();
        });

        process.on("exit", (code, signal) => {
            if (code || signal) {
                this.listener.error(new Error("pty exited unexpectedly"));
            }
            this.flush();
            this.listener.complete();
        });
    }

    on(cmd, handler) {
        this._emitter.on(cmd, handler);
    }

    processBareCommand(mneu, arg) {
        switch (mneu) {
            case "X":
                this.listener.next({ type: "exitCode", code: arg });
                break;
            case "S":
                this.listener.next({ type: "signal", signal: arg });
                break;
            case "P":
                this.listener.next({ type: "pid", pid: arg });
                break;
        }
    }

    processCommandWithInput(mneu, input) {
        if (mneu === COMMS_COMMAND_MNEU) {
            const message = input.toString("utf8");
            if (message === "START\n") {
                this.listener.next({ type: "started" });
            }
        }
        const streamName = PTY_COMMAND_STREAM_NAMES[mneu];
        if (streamName) {
            this.listener.next({
                type: "stream",
                stream: streamName,
                chunk: input
            });
        }
    }

    flush() {
        if (
            this._pendingCommand ||
            this._bufferedInputLength ||
            this._commandInputBuffer.length ||
            this._cmdBuffer
        ) {
            this.listener.error(new Error("pty terminated mid output"));
        }
    }

    append(_chunk) {
        let i;
        let chunk = _chunk;
        while (chunk.length) {
            if (this._pendingCommand) {
                const { mneu, length } = this._pendingCommand;
                const remainingLength = length - this._bufferedInputLength;
                if (chunk.length < remainingLength) {
                    this._commandInputBuffer.push(chunk);
                    this._bufferedInputLength += chunk.length;
                    return;
                }
                const newSeg = chunk.slice(0, remainingLength);
                this._commandInputBuffer.push(newSeg);
                const commandInput = Buffer.concat(this._commandInputBuffer);
                this.processCommandWithInput(mneu, commandInput);
                this._pendingCommand = null;
                this._bufferedInputLength = 0;
                this._commandInputBuffer = [];
                chunk = chunk.slice(remainingLength);
            }
            for (i = 0; i < chunk.length; i++) {
                const c = chunk.slice(i, i + 1).toString("ascii");
                if (c === ":") {
                    const [, mneu, _arg] = /(.)([0-9]+)/.exec(this._cmdBuffer);
                    const arg = parseInt(_arg, 10);
                    this._cmdBuffer = "";
                    if (commandHasInput(mneu)) {
                        this._pendingCommand = { mneu, length: arg };
                        i++;
                        break;
                    } else {
                        this.processBareCommand(mneu, arg);
                    }
                } else {
                    this._cmdBuffer += c;
                }
            }
            chunk = chunk.slice(i);
        }
    }
}