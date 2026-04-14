/**
 * Serves the static Todo app and reads/writes data/todos.json via /api/todos.
 *
 * Setup: npm install   then: node server.js
 * Open the URL printed in the terminal (default port 3000).
 *
 * Gemini: uses @google/genai (see https://ai.google.dev/gemini-api/docs/quickstart).
 * API key from GEMINI_API_KEY or config.local.json → geminiApiKey (browser never sends the key).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "data", "todos.json");
const CONFIG_LOCAL_FILE = path.join(ROOT, "config.local.json");
const PREFERRED_PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_TRY = PREFERRED_PORT + 40;
let listenPort = PREFERRED_PORT;

const DEFAULT_DOC = {
  version: 1,
  todos: [],
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

/** Gemini returns one of these; invalid labels map to Other. */
const VALID_AI_CATEGORIES = [
  "Work",
  "Study",
  "Health",
  "Shopping",
  "Personal",
  "Other",
];

/**
 * Default model per Gemini API quickstart:
 * https://ai.google.dev/gemini-api/docs/quickstart
 * Override: GEMINI_MODEL=...
 */
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

/**
 * Read Gemini key from config.local.json (read on each AI request so edits apply without restart).
 * @returns {string}
 */
function getGeminiApiKeyFromConfigFile() {
  try {
    if (!fs.existsSync(CONFIG_LOCAL_FILE)) return "";
    const raw = fs
      .readFileSync(CONFIG_LOCAL_FILE, "utf8")
      .replace(/^\uFEFF/, "");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return "";
    const a =
      typeof data.geminiApiKey === "string" ? data.geminiApiKey.trim() : "";
    const b =
      typeof data.GEMINI_API_KEY === "string" ? data.GEMINI_API_KEY.trim() : "";
    return a || b;
  } catch (e) {
    console.warn(
      "config.local.json: %s",
      String(/** @type {Error} */ (e).message),
    );
  }
  return "";
}

/**
 * @param {import("http").IncomingMessage} req
 * @param {number} maxLen
 * @returns {Promise<string>}
 */
function readRequestBody(req, maxLen = 1_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxLen) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

/**
 * One Gemini call: task title -> category JSON (via @google/genai SDK).
 * @param {string} taskTitle
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
async function geminiCategorizeTask(taskTitle, apiKey) {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `You label todo tasks with exactly one category.

Return ONLY valid JSON in this form: {"category":"Work"}
The category string must be exactly one of: Work, Study, Health, Shopping, Personal, Other. No other keys.
Do not write any introduction, explanation, or text before or after the JSON.

Task: ${JSON.stringify(taskTitle)}`;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      temperature: 0.2,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
      thinkingConfig: {
        thinkingBudget: 0,
      },
    },
  });

  const text = response.text;
  const finishReason = response.candidates?.[0]?.finishReason;
  if (!text || typeof text !== "string") {
    const block = response.promptFeedback?.blockReason;
    if (block) throw new Error(`Blocked: ${block}`);
    throw new Error("No reply text from Gemini.");
  }

  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned invalid JSON");
  }

  const cat = obj && obj.category;
  if (typeof cat === "string" && VALID_AI_CATEGORIES.includes(cat)) {
    return cat;
  }
  return "Other";
}

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      `${JSON.stringify(DEFAULT_DOC, null, 2)}\n`,
      "utf8",
    );
  }
}

/** @returns {string} */
function readTodosFile() {
  ensureDataFile();
  return fs.readFileSync(DATA_FILE, "utf8");
}

/**
 * @param {string} body
 */
function writeTodosFile(body) {
  const data = JSON.parse(body);
  if (data == null || typeof data !== "object") {
    throw new Error("Body must be a JSON object");
  }
  if (data.version !== 1) {
    throw new Error("Expected version 1");
  }
  if (!Array.isArray(data.todos)) {
    throw new Error("Expected todos array");
  }
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/**
 * @param {string} urlPath
 * @returns {string | null}
 */
function safeFilePath(urlPath) {
  let p = decodeURIComponent(urlPath.split("?")[0]);
  if (p.includes("..")) return null;
  p = p.replace(/^\/+/, "");
  if (p === "" || p.endsWith("/")) p = path.join(p, "index.html");
  const full = path.join(ROOT, p);
  const resolved = path.resolve(full);
  if (!resolved.startsWith(path.resolve(ROOT))) return null;
  return resolved;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1`);

  if (url.pathname === "/api/todos" && req.method === "GET") {
    try {
      const text = readTodosFile();
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(text);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ error: String(/** @type {Error} */ (e).message) }),
      );
    }
    return;
  }

  if (
    url.pathname === "/api/todos" &&
    (req.method === "PUT" || req.method === "POST")
  ) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        body = "";
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        writeTodosFile(body);
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(readTodosFile());
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ error: String(/** @type {Error} */ (e).message) }),
        );
      }
    });
    return;
  }

  if (url.pathname === "/api/ai/categorize" && req.method === "POST") {
    readRequestBody(req, 32_768)
      .then(async (raw) => {
        let parsed;
        try {
          parsed = JSON.parse(raw || "{}");
        } catch {
          res.writeHead(400, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify({ error: "Invalid JSON body" }));
          return;
        }

        const title =
          typeof parsed.title === "string"
            ? parsed.title.trim().slice(0, 500)
            : "";
        const envKey = process.env.GEMINI_API_KEY
          ? String(process.env.GEMINI_API_KEY).trim()
          : "";
        const apiKey = envKey || getGeminiApiKeyFromConfigFile();

        if (!title) {
          res.writeHead(400, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify({ error: "Missing or empty title" }));
          return;
        }
        if (!apiKey) {
          res.writeHead(401, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({
              error:
                "No API key. Put geminiApiKey in config.local.json (same folder as server.js) or set GEMINI_API_KEY, then restart node server.js.",
            }),
          );
          return;
        }

        try {
          const category = await geminiCategorizeTask(title, apiKey);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify({ category }));
        } catch (e) {
          res.writeHead(502, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({
              error: String(/** @type {Error} */ (e).message || e),
            }),
          );
        }
      })
      .catch((e) => {
        res.writeHead(400, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(
          JSON.stringify({
            error: String(/** @type {Error} */ (e).message || e),
          }),
        );
      });
    return;
  }

  const filePath = safeFilePath(url.pathname);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
    });
    res.end(buf);
  });
});

ensureDataFile();

server.on("error", (err) => {
  const e = /** @type {NodeJS.ErrnoException} */ (err);
  if (e.code === "EADDRINUSE" && listenPort < MAX_PORT_TRY) {
    console.log(`Port ${listenPort} is in use, trying ${listenPort + 1}...`);
    listenPort += 1;
    server.listen(listenPort);
    return;
  }
  if (e.code === "EADDRINUSE") {
    console.error(
      `Port ${PREFERRED_PORT} (and next ports) are in use. Stop the other process or run PORT=3050 node server.js`,
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(listenPort, () => {
  if (listenPort !== PREFERRED_PORT) {
    console.log(
      `(Port ${PREFERRED_PORT} was busy; using ${listenPort} instead.)`,
    );
  }
  console.log(`Todo app: http://localhost:${listenPort}`);
  console.log(`Data file: ${DATA_FILE}`);
  const envK = process.env.GEMINI_API_KEY
    ? String(process.env.GEMINI_API_KEY).trim()
    : "";
  if (envK) {
    console.log(`Gemini: API key from GEMINI_API_KEY (model ${GEMINI_MODEL})`);
  } else if (getGeminiApiKeyFromConfigFile()) {
    console.log(
      `Gemini: API key from config.local.json (model ${GEMINI_MODEL})`,
    );
  } else {
    console.log(
      `Gemini: no key — add config.local.json with geminiApiKey or set GEMINI_API_KEY. Expected file: ${CONFIG_LOCAL_FILE}`,
    );
  }
});
