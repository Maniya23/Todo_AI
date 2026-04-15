# ✅ Todo App

**Check boxes. Sort stuff. Let a robot guess your categories.**  
A cozy little todo app: Bootstrap on the outside, vanilla JS on the inside, and a tiny Node server holding the fort (and your `todos.json`).

---

## 🌐 Live preview

**Try it in the wild:** [https://todo-ai-aztv.onrender.com/](https://todo-ai-aztv.onrender.com/)

*(Hosted on [Render](https://render.com/)—first load after sleep can take a few seconds. Coffee break ☕)*

---

## ✨ What it does

- ➕ Add tasks, pick a **category** by hand, or go **Auto (AI)** and let Gemini label the chaos.
- 🔍 **Filter** the list by category when your brain only wants to see “Work” today.
- ✔️ **Complete** and 🗑️ **delete** tasks like it’s 1999, but with rounded corners.
- 💾 Everything lives in **`data/todos.json`** so your list survives refreshes—at least while your server does.

---

## 🧱 The stack (no framework drama)

| Layer | Choice |
|--------|--------|
| UI | HTML + Bootstrap 5 |
| Client logic | Plain JavaScript |
| Server | Node.js `http` + static files |
| AI | [`@google/genai`](https://www.npmjs.com/package/@google/genai) (Gemini on the server—no API key in the browser) |

Node **20+** is the happy path (the GenAI SDK likes it that way).

---

## 📁 Folder tour (the hits)

```
Todo_App/
├── server.js          # Serves the app, /api/todos, and /api/ai/categorize
├── package.json
├── index.html         # Two cards: add tasks | view & filter
├── css/styles.css
├── js/app.js          # All the clicking and listing
├── js/gemini.js       # “Hey server, categorize this”
├── data/todos.json    # Your tasks (server reads/writes this)
└── config.local.json  # Optional local Gemini key (gitignored—shh)
```

---

## 🚀 Quick start (local)

**1. Install**

```bash
npm install
```

**2. Give Gemini a key** (pick your adventure):

- **Shell export** (great for laptops and cloud hosts):

  ```bash
  export GEMINI_API_KEY="your_key_here"
  ```

- **Or** drop a file named `config.local.json` next to `server.js`:

  ```json
  {
    "geminiApiKey": "your_key_here"
  }
  ```

Grab a key from [Google AI Studio](https://aistudio.google.com/apikey). The official intro lives here: [Gemini API quickstart](https://ai.google.dev/gemini-api/docs/quickstart).

**3. Run**

```bash
node server.js
```

Open the URL it prints (usually `http://localhost:3000`). If 3000 is taken, this server bumps to the next free port—because sharing is caring, but not with ports.

**4. Optional knobs**

| Variable | What it does |
|----------|----------------|
| `PORT` | Listen port (Render sets this for you) |
| `GEMINI_API_KEY` | Gemini API key |
| `GEMINI_MODEL` | Defaults to `gemini-3-flash-preview` if unset |

---

## 🔌 API cheat sheet

Same origin as the page—your frontend already calls these:

- `GET /api/todos` — load tasks from `data/todos.json`
- `PUT /api/todos` — save the whole document
- `POST /api/ai/categorize` — `{ "title": "..." }` → `{ "category": "Work" }` (server uses your key)

---

## ☁️ Shipping it (e.g. Render)

**Web Service** settings that work:

- **Build:** `npm install`
- **Start:** `node server.js`
- **Env:** set `GEMINI_API_KEY` in the dashboard (don’t commit real keys)

Your live app can live at something like [https://todo-ai-aztv.onrender.com/](https://todo-ai-aztv.onrender.com/) once deployed.

Heads-up: on many hosts the disk is **ephemeral**. Your JSON file might get a fresh start on redeploy unless you add persistent storage or a database. The app won’t judge you—it’ll just forget.

---

## 🔒 Security (the boring-but-important bit)

- Never commit `config.local.json` with a real key.
- In production, prefer **`GEMINI_API_KEY` on the server** over baking secrets into files.

---

## 📜 License

Use it, break it, fork it, teach with it. Have fun. 🎉
