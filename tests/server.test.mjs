import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDashboardHandler } from "../serve-dashboard.mjs";

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dashboard server "));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, "dashboard");
  const sibling = path.join(directory, "dashboard-backup");
  await fs.mkdir(path.join(root, "data"), { recursive: true });
  await fs.mkdir(sibling);
  await fs.writeFile(path.join(root, "index.html"), "<h1>Dashboard</h1>");
  await fs.writeFile(path.join(root, "data", "countries.json"), '{"results":[]}');
  await fs.writeFile(path.join(sibling, "secret.json"), '{"secret":true}');
  await fs.symlink(sibling, path.join(root, "outside"));
  await fs.symlink(path.join(root, "data"), path.join(root, "inside"));
  return createDashboardHandler(root);
}

async function request(handler, url, method = "GET") {
  const result = {};
  await handler({ url, method }, {
    writeHead(status, headers) {
      result.status = status;
      result.headers = headers;
    },
    end(body) {
      result.body = body === undefined ? "" : body.toString();
    }
  });
  return result;
}

test("serves the index and JSON files from a root containing spaces", async (t) => {
  const handler = await fixture(t);
  const index = await request(handler, "/?dnv=all");
  assert.equal(index.status, 200);
  assert.equal(index.body, "<h1>Dashboard</h1>");
  assert.equal(index.headers["Content-Type"], "text/html; charset=utf-8");
  const json = await request(handler, "/data/countries.json");
  assert.equal(json.status, 200);
  assert.equal(json.body, '{"results":[]}');
  assert.equal(json.headers["Content-Type"], "application/json; charset=utf-8");
});

test("rejects traversal into a sibling sharing the dashboard prefix", async (t) => {
  const handler = await fixture(t);
  const response = await request(handler, "/..%2fdashboard-backup/secret.json");
  assert.equal(response.status, 403);
  assert.equal(response.body, "Forbidden");
});

test("rejects symlinks outside the root and permits internal symlinks", async (t) => {
  const handler = await fixture(t);
  assert.equal((await request(handler, "/outside/secret.json")).status, 403);
  const internal = await request(handler, "/inside/countries.json");
  assert.equal(internal.status, 200);
  assert.equal(internal.body, '{"results":[]}');
});

test("reports malformed URLs as bad requests", async (t) => {
  const handler = await fixture(t);
  for (const url of ["/%E0%A4%A", "/%00index.html", "http://["]) {
    assert.equal((await request(handler, url)).status, 400, url);
  }
});

test("reports missing files and directories as not found", async (t) => {
  const handler = await fixture(t);
  for (const url of ["/missing.json", "/data", "/index.html/child"]) {
    assert.equal((await request(handler, url)).status, 404, url);
  }
});

test("supports HEAD and rejects unsupported methods", async (t) => {
  const handler = await fixture(t);
  const head = await request(handler, "/", "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.body, "");
  assert.equal(head.headers["Content-Length"], Buffer.byteLength("<h1>Dashboard</h1>"));
  const missing = await request(handler, "/missing", "HEAD");
  assert.equal(missing.status, 404);
  assert.equal(missing.body, "");
  const post = await request(handler, "/", "POST");
  assert.equal(post.status, 405);
  assert.equal(post.headers.Allow, "GET, HEAD");
});
