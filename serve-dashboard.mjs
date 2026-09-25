import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(import.meta.url);
const dashboardRoot = path.join(path.dirname(modulePath), "dashboard");
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function isWithinRoot(root, filePath) {
  const relative = path.relative(root, filePath);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function createDashboardHandler(rootDirectory = dashboardRoot) {
  const root = path.resolve(rootDirectory);

  return async (request, response) => {
    const send = (status, body, headers = {}) => {
      response.writeHead(status, {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        ...headers
      });
      response.end(request.method === "HEAD" ? undefined : body);
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      send(405, "Method not allowed", { Allow: "GET, HEAD" });
      return;
    }

    let requestedPath;
    try {
      const url = new URL(request.url, "http://localhost");
      requestedPath = decodeURIComponent(url.pathname);
      if (requestedPath.includes("\0")) throw new URIError("Invalid pathname");
      if (requestedPath === "/") requestedPath = "/index.html";
    } catch {
      send(400, "Bad request");
      return;
    }

    const filePath = path.resolve(root, `.${requestedPath}`);
    if (!isWithinRoot(root, filePath)) {
      send(403, "Forbidden");
      return;
    }

    try {
      const [realRoot, realFilePath] = await Promise.all([fs.realpath(root), fs.realpath(filePath)]);
      if (!isWithinRoot(realRoot, realFilePath)) {
        send(403, "Forbidden");
        return;
      }
      if (!(await fs.stat(realFilePath)).isFile()) {
        send(404, "Not found");
        return;
      }

      const body = await fs.readFile(realFilePath);
      send(200, body, {
        "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
        "Content-Length": body.length
      });
    } catch (error) {
      if (["ENOENT", "ENOTDIR", "EISDIR"].includes(error.code)) {
        send(404, "Not found");
      } else if (["EACCES", "EPERM"].includes(error.code)) {
        send(403, "Forbidden");
      } else {
        send(500, "Server error");
      }
    }
  };
}

export function createDashboardServer(rootDirectory = dashboardRoot) {
  return http.createServer(createDashboardHandler(rootDirectory));
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  const server = createDashboardServer();
  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    console.log(`Dashboard: http://127.0.0.1:${port}`);
  });
}
