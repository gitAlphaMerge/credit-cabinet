import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Настоящий локальный HTTP /score, производственный адаптер cores и неизменённое ядро Лизы.
// Никакой подмены fetch или значений скоринга.
export async function startRealCore() {
  const root = fileURLToPath(new URL("../../../../..", import.meta.url));
  const python = [
    "import sys,json,os",
    "sys.path.insert(0,os.path.join(sys.argv[1],'services','ml-model'))",
    "import cores",
    "from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer",
    "class Handler(BaseHTTPRequestHandler):",
    " def log_message(self,*args): pass",
    " def do_POST(self):",
    "  try:",
    "   r=json.loads(self.rfile.read(int(self.headers['Content-Length'])))",
    "   result=cores.REGISTRY['liza'][0](r['statement_csv'],r['need'],r['questionnaire'])",
    "   body=json.dumps({'core':result},ensure_ascii=False).encode('utf-8')",
    "   self.send_response(200)",
    "   self.send_header('Content-Type','application/json')",
    "   self.send_header('Content-Length',str(len(body)))",
    "   self.end_headers(); self.wfile.write(body)",
    "  except Exception as error:",
    "   print(type(error).__name__,file=sys.stderr,flush=True)",
    "   self.send_error(500)",
    "server=ThreadingHTTPServer(('127.0.0.1',0),Handler)",
    "print(server.server_port,flush=True)",
    "server.serve_forever()",
  ].join("\n");
  const child = spawn(
    "python",
    ["-B", "-X", "utf8", "-u", "-c", python, root],
    {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CORE_ID: "liza" },
    },
  );
  let errors = "";
  child.stderr.on("data", (data) => {
    errors += data;
  });
  try {
    const port = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("G2: локальное ядро не запустилось")),
        15000,
      );
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/^(\d+)\r?\n/);
        if (match) {
          clearTimeout(timeout);
          resolve(Number(match[1]));
        }
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", () => {
        clearTimeout(timeout);
        reject(new Error(`G2: ядро завершилось: ${errors}`));
      });
    });
    return {
      url: `http://127.0.0.1:${port}`,
      stop: async () => {
        if (child.exitCode !== null) return;
        await new Promise<void>((resolve) => {
          child.once("exit", () => resolve());
          child.kill();
        });
      },
    };
  } catch (error) {
    child.kill();
    throw error;
  }
}
