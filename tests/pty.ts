/**
 * Drives a command through a pseudo-terminal with `script`.
 */
import { stripAnsi } from "@oakoliver/lipgloss";

/**
 * Runs `shell` in a pty, typing `keys` after the UI has started. A watchdog
 * kills the pty's process group after 8s so a hung program fails the test
 * instead of hanging the suite.
 */
export async function inPty(command: string, keys: string[], { keepOpen = false } = {}): Promise<string> {
  const quiet = ">/dev/null 2>&1 </dev/null";
  const shell = `stty rows 24 cols 100; (sleep 8 ${quiet}; kill 0) ${quiet} & W=$!; ${command}; kill $W 2>/dev/null`;
  const quoted = `'${shell.replace(/'/g, `'\\''`)}'`;
  const script = process.platform === "darwin"
    ? `script -q /dev/null sh -c ${quoted}`
    : `script -qec ${quoted} /dev/null`;
  // Bun's pipes are sockets, which script rejects as stdin; cat hands it a pipe.
  const proc = Bun.spawn(["sh", "-c", `cat | ${script}`], { cwd: `${import.meta.dir}/..`, stdin: "pipe", stdout: "pipe" });
  await Bun.sleep(1500);
  for (const key of keys) {
    proc.stdin.write(key);
    await Bun.sleep(300);
  }
  // keepOpen: leave the terminal open, as a real one stays, and only return
  // what was printed before the terminal closes, so a command that does not
  // exit on its own (script(1) itself waits for the terminal) shows no
  // "[exit=…]" marker.
  let out = "";
  if (keepOpen) {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    const deadline = Date.now() + 4000;
    while (!out.includes("[exit=") && Date.now() < deadline) {
      const chunk = await Promise.race([reader.read(), Bun.sleep(deadline - Date.now()).then(() => null)]);
      if (!chunk || chunk.done) break;
      out += decoder.decode(chunk.value);
    }
    proc.kill();
    reader.releaseLock();
  } else {
    proc.stdin.end();
    out = await new Response(proc.stdout).text();
  }
  await proc.exited;
  return stripAnsi(out).replace(/\x1b\[[0-9;?<>=]*[a-zA-Z]/g, "").replace(/\r/g, "");
}

export const hasScript = Bun.which("script") !== null;

