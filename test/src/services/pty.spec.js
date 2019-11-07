/* eslint-env mocha */
/* eslint no-unused-expressions:0 */

// Module under test
import pty from "../../../src/services/pty";

// Support
import path from "path";
import { expect } from "chai";

describe("pty", () => {
    [
        // prettier-ignore
        ["SIGHUP", 1],
        ["SIGTERM", 15]
    ].forEach(([signal, signalCode]) => {
        it(`should expose a method for signaling ${signal} to the process`, async () => {
            const proc = pty(
                [
                    path.resolve(
                        __dirname,
                        "../../test-resources/pty-test-scripts/sleep-test.bash"
                    )
                ],
                {}
            );

            proc.stream.addListener({
                next(event) {
                    // FIXME: Document that you can't signal or probably use stdin until
                    // the child process has been started by the pty, which is from the "started"
                    // event.
                    if (event.type === "started") {
                        proc.signal(signal);
                    }
                },
                error(error) {
                    // console.error(error);
                },
                complete() {
                    // console.log("---complete---");
                }
            });
            const [exitSignal] = await Promise.all([
                awaitStream(
                    proc.stream
                        .filter(event => event.type === "signal")
                        .map(event => {
                            // console.log("Got signal", event);
                            return event.signal;
                        })
                ),
                awaitStream(proc.stream)
            ]);
            expect(exitSignal).equals(signalCode);
        });
    });

    // it("should expose a method for signaling SIGINT to the process", async () => {
    //     const proc = pty(
    //         [
    //             path.resolve(
    //                 __dirname,
    //                 "../../test-resources/pty-test-scripts/sigint-test.bash"
    //             )
    //         ],
    //         {}
    //     );

    //     proc.stream.addListener({
    //         next(event) {
    //             if (event.type === "pid") {
    //                 proc.signal("SIGINT");
    //             }
    //         }
    //     });
    //     const exitCode = await awaitStream(
    //         proc.stream
    //             .filter(event => event.type === "exitCode")
    //             .map(event => event.code)
    //     );
    //     expect(exitCode).equals(0);
    // });

    it("should emit the pid of the process", async () => {
        const stream = pty(
            [
                path.resolve(
                    __dirname,
                    "../../test-resources/pty-test-scripts/pid-test.bash"
                )
            ],
            {}
        ).stream;

        const [pid, stdout] = await Promise.all([
            awaitStream(
                stream
                    .filter(event => event.type === "pid")
                    .map(event => event.pid)
            ),
            awaitStream(
                stream
                    .filter(event => event.stream === "stdout")
                    .map(event => event.chunk.toString("utf8"))
                    .fold(concatStrings, "")
            )
        ]);
        expect(stdout.trim()).to.equal(String(pid));
    });

    [(0, 1, 120)].forEach(expectedExitCode => {
        it(`should emit the exit code of ${expectedExitCode}`, async () => {
            const stream = pty(
                [
                    path.resolve(
                        __dirname,
                        `../../test-resources/pty-test-scripts/exit-code-${expectedExitCode}.bash`
                    )
                ],
                {}
            ).stream;
            const exitCode = await awaitStream(
                stream
                    .filter(event => event.type === "exitCode")
                    .map(event => event.code)
            );
            expect(exitCode).to.equal(expectedExitCode);
        });
    });

    it("should emit the stdout and stderr streams", async () => {
        const stream = pty(
            [
                path.resolve(
                    __dirname,
                    "../../test-resources/pty-test-scripts/stream-test.bash"
                )
            ],
            {}
        ).stream;
        const [stdout, stderr] = await Promise.all([
            awaitStream(
                stream
                    .filter(event => event.stream === "stdout")
                    .map(event => event.chunk.toString("utf8"))
                    .fold(concatStrings, "")
            ),
            awaitStream(
                stream
                    .filter(event => event.stream === "stderr")
                    .map(event => event.chunk.toString("utf8"))
                    .fold(concatStrings, "")
            )
        ]);
        expect(stdout.split(/\r?\n/)).to.deep.equal([
            "OUT:one",
            "OUT:two",
            "OUT:three",
            "OUT:four",
            "OUT:five",
            "OUT:six",
            "OUT:seven",
            ""
        ]);
        expect(stderr.split(/\r?\n/)).to.deep.equal([
            "ERR:one",
            "ERR:two",
            "ERR:three",
            "ERR:four",
            "ERR:five",
            ""
        ]);
    });
});

const concatStrings = (a, t) => a + t;

async function awaitStream(stream) {
    return new Promise((resolve, reject) => {
        let lastEvent;
        stream.addListener({
            next: e => {
                lastEvent = e;
            },
            error: reject,
            complete: () => resolve(lastEvent)
        });
    });
}