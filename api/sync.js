const REPO = "arjunsena-git/todo";
const BRANCH = "data";
const PATH = "state.json";
const GITHUB_CONTENTS_URL = `https://api.github.com/repos/${REPO}/contents/${PATH}`;
const ALLOWED_ORIGINS = new Set([
  "https://arjunsena-git.github.io",
  "http://localhost:8099",
  "http://127.0.0.1:8099"
]);

function corsHeaders(req) {
  const origin = req.headers.origin || "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://arjunsena-git.github.io";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Cache-Control",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function sendJson(req, res, status, body) {
  const headers = corsHeaders(req);
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).send(JSON.stringify(body));
}

function githubHeaders() {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "arjun-todo-sync-vercel",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

function isValidState(value) {
  return Boolean(
    value &&
    value.work &&
    value.personal &&
    Array.isArray(value.work.tasks) &&
    Array.isArray(value.work.children) &&
    Array.isArray(value.personal.tasks) &&
    Array.isArray(value.personal.children)
  );
}

async function readGithubState() {
  const response = await fetch(`${GITHUB_CONTENTS_URL}?ref=${BRANCH}&t=${Date.now()}`, {
    headers: githubHeaders()
  });
  if (response.status === 404) return { missing: true };
  if (!response.ok) {
    return { error: `GitHub read failed: HTTP ${response.status}`, status: 502 };
  }

  const data = await response.json();
  const decoded = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
  return { sha: data.sha, state: JSON.parse(decoded) };
}

async function writeGithubState(state, retryOnConflict = true) {
  const current = await readGithubState();
  if (current.error) return current;

  const body = {
    message: "sync: update todo state",
    content: Buffer.from(JSON.stringify(state), "utf8").toString("base64"),
    branch: BRANCH
  };
  if (current.sha) body.sha = current.sha;

  const response = await fetch(GITHUB_CONTENTS_URL, {
    method: "PUT",
    headers: githubHeaders(),
    body: JSON.stringify(body)
  });

  if (response.status === 409 && retryOnConflict) {
    return writeGithubState(state, false);
  }
  if (!response.ok) {
    return { error: `GitHub write failed: HTTP ${response.status}`, status: 502 };
  }

  const data = await response.json();
  return { sha: data.content && data.content.sha };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    const headers = corsHeaders(req);
    Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
    res.status(204).end();
    return;
  }

  if (!process.env.GITHUB_TOKEN) {
    sendJson(req, res, 500, { error: "Server is missing GITHUB_TOKEN" });
    return;
  }

  if (req.method === "GET") {
    const result = await readGithubState();
    if (result.missing) sendJson(req, res, 404, { error: "Cloud state not seeded" });
    else if (result.error) sendJson(req, res, result.status, { error: result.error });
    else sendJson(req, res, 200, { state: result.state, sha: result.sha });
    return;
  }

  if (req.method === "PUT") {
    const state = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!isValidState(state)) {
      sendJson(req, res, 400, { error: "Invalid todo state" });
      return;
    }
    const result = await writeGithubState(state);
    if (result.error) sendJson(req, res, result.status, { error: result.error });
    else sendJson(req, res, 200, { ok: true, sha: result.sha });
    return;
  }

  sendJson(req, res, 405, { error: "Method not allowed" });
};
