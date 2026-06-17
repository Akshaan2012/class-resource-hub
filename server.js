const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 4173);
const CLASS_CODE = process.env.CLASS_CODE || "GENWISE";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const UPLOAD_DIR = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(ROOT, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 80 * 1024 * 1024);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
};

function defaultDb() {
  return {
    users: [],
    sessions: {},
    folders: [
      {
        id: id("fold"),
        name: "General",
        createdAt: now(),
        authorId: "system",
      },
    ],
    resources: [],
    comments: [],
    requests: [],
    announcements: [
      {
        id: id("ann"),
        text: "Welcome to the class resource hub. Share useful files, prompts, links, and notes here.",
        createdAt: now(),
        authorId: "system",
      },
    ],
    bookmarks: {},
  };
}

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    writeDb(defaultDb());
  }
}

function readDb() {
  ensureStore();
  const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  if (ensureDbShape(db)) writeDb(db);
  return db;
}

function writeDb(db) {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function now() {
  return new Date().toISOString();
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function fail(res, status, message) {
  json(res, status, { error: message });
}

function safeJoin(baseDir, requestPath) {
  const resolved = path.resolve(baseDir, decodeURIComponent(requestPath).replace(/^[/\\]+/, ""));
  if (!resolved.startsWith(path.resolve(baseDir))) return null;
  return resolved;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error(`Request is too large. Limit is ${Math.round(MAX_BODY_BYTES / 1024 / 1024)} MB.`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON.");
  }
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    createdAt: user.createdAt,
  };
}

function getSession(req, db) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)classHubSession=([^;]+)/);
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  const session = db.sessions[token];
  if (!session) return null;
  const user = db.users.find((item) => item.id === session.userId);
  if (!user) return null;
  return { token, user };
}

function requireUser(req, res, db) {
  const session = getSession(req, db);
  if (!session) {
    fail(res, 401, "Please sign in with the class invite code.");
    return null;
  }
  return session.user;
}

function setSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `classHubSession=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 45}`
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "classHubSession=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

function sanitizeName(name) {
  return String(name || "")
    .replace(/[^\w.\- ()[\]]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "upload.bin";
}

function normalizeFolderName(name) {
  return String(name || "General")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || "General";
}

function folderKey(name) {
  return normalizeFolderName(name).toLowerCase();
}

function ensureFolder(db, name, authorId = "system") {
  const cleanName = normalizeFolderName(name);
  const existing = db.folders.find((folder) => folderKey(folder.name) === folderKey(cleanName));
  if (existing) return existing;
  const folder = {
    id: id("fold"),
    name: cleanName,
    createdAt: now(),
    authorId,
  };
  db.folders.push(folder);
  return folder;
}

function ensureDbShape(db) {
  let changed = false;
  for (const key of ["users", "resources", "comments", "requests", "announcements"]) {
    if (!Array.isArray(db[key])) {
      db[key] = [];
      changed = true;
    }
  }
  if (!db.sessions || typeof db.sessions !== "object") {
    db.sessions = {};
    changed = true;
  }
  if (!db.bookmarks || typeof db.bookmarks !== "object") {
    db.bookmarks = {};
    changed = true;
  }
  if (!Array.isArray(db.folders)) {
    db.folders = [];
    changed = true;
  }

  const before = db.folders.length;
  ensureFolder(db, "General");
  for (const resource of db.resources) {
    const subject = normalizeFolderName(resource.subject);
    if (resource.subject !== subject) {
      resource.subject = subject;
      changed = true;
    }
    ensureFolder(db, resource.subject, resource.authorId);
  }
  for (const request of db.requests) {
    const subject = normalizeFolderName(request.subject);
    if (request.subject !== subject) {
      request.subject = subject;
      changed = true;
    }
    ensureFolder(db, request.subject, request.authorId);
  }
  return changed || before !== db.folders.length;
}

function normalizeTags(tags) {
  return [...new Set(String(tags || "")
    .split(",")
    .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean)
    .slice(0, 12))];
}

function decorate(db, user) {
  const usersById = new Map(db.users.map((item) => [item.id, publicUser(item)]));
  const commentCount = new Map();
  for (const comment of db.comments) {
    commentCount.set(comment.resourceId, (commentCount.get(comment.resourceId) || 0) + 1);
  }
  const bookmarks = new Set(db.bookmarks[user.id] || []);
  const resourceCountByFolder = new Map();
  const openRequestCountByFolder = new Map();
  for (const resource of db.resources) {
    const key = folderKey(resource.subject);
    resourceCountByFolder.set(key, (resourceCountByFolder.get(key) || 0) + 1);
  }
  for (const request of db.requests) {
    if (!request.fulfilled) {
      const key = folderKey(request.subject);
      openRequestCountByFolder.set(key, (openRequestCountByFolder.get(key) || 0) + 1);
    }
  }

  return {
    user: publicUser(user),
    classCode: CLASS_CODE,
    folders: db.folders
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((folder) => ({
        ...folder,
        author: usersById.get(folder.authorId) || { id: folder.authorId, name: "Class Hub" },
        isMine: folder.authorId === user.id,
        resourceCount: resourceCountByFolder.get(folderKey(folder.name)) || 0,
        openRequestCount: openRequestCountByFolder.get(folderKey(folder.name)) || 0,
      })),
    resources: db.resources
      .slice()
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.createdAt.localeCompare(a.createdAt))
      .map((resource) => ({
        ...resource,
        author: usersById.get(resource.authorId) || { id: resource.authorId, name: "Classmate" },
        isMine: resource.authorId === user.id,
        bookmarked: bookmarks.has(resource.id),
        commentCount: commentCount.get(resource.id) || 0,
      })),
    comments: db.comments.map((comment) => ({
      ...comment,
      author: usersById.get(comment.authorId) || { id: comment.authorId, name: "Classmate" },
      isMine: comment.authorId === user.id,
    })),
    requests: db.requests
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((request) => ({
        ...request,
        author: usersById.get(request.authorId) || { id: request.authorId, name: "Classmate" },
        isMine: request.authorId === user.id,
      })),
    announcements: db.announcements
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((announcement) => ({
        ...announcement,
        author: usersById.get(announcement.authorId) || { id: announcement.authorId, name: "Class Hub" },
        isMine: announcement.authorId === user.id,
      })),
  };
}

function resourceForDownload(resource) {
  if (!resource || resource.type !== "file" || !resource.filePath) return null;
  return safeJoin(UPLOAD_DIR, resource.filePath);
}

function serveFile(res, filePath, downloadName) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      fail(res, 404, "Not found.");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
      "Content-Length": content.length,
    };
    if (downloadName) {
      headers["Content-Disposition"] = `attachment; filename="${downloadName.replace(/"/g, "")}"`;
    }
    res.writeHead(200, headers);
    res.end(content);
  });
}

function serveStatic(req, res, reqUrl) {
  const staticPath = reqUrl.pathname === "/" ? "index.html" : reqUrl.pathname;
  const filePath = safeJoin(PUBLIC_DIR, staticPath);
  if (!filePath) {
    fail(res, 403, "Forbidden.");
    return;
  }
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      fail(res, 404, "Not found.");
      return;
    }
    serveFile(res, filePath);
  });
}

function validResourceType(type) {
  return ["file", "text", "prompt", "link"].includes(type);
}

async function handleApi(req, res, reqUrl) {
  const db = readDb();
  const route = `${req.method} ${reqUrl.pathname}`;

  try {
    if (route === "GET /api/session") {
      const session = getSession(req, db);
      if (!session) {
        json(res, 200, { user: null, classCode: CLASS_CODE });
        return;
      }
      json(res, 200, decorate(db, session.user));
      return;
    }

    if (route === "POST /api/signup") {
      const payload = await readJson(req);
      const name = String(payload.name || "").trim().slice(0, 50);
      const inviteCode = String(payload.inviteCode || "").trim();
      if (!name || name.length < 2) {
        fail(res, 400, "Enter your name.");
        return;
      }
      if (inviteCode.toLowerCase() !== CLASS_CODE.toLowerCase()) {
        fail(res, 403, "That class invite code does not match.");
        return;
      }
      let user = db.users.find((item) => item.name.toLowerCase() === name.toLowerCase());
      if (!user) {
        user = { id: id("user"), name, createdAt: now() };
        db.users.push(user);
      }
      const token = id("session");
      db.sessions[token] = { userId: user.id, createdAt: now() };
      writeDb(db);
      setSessionCookie(res, token);
      json(res, 200, decorate(db, user));
      return;
    }

    if (route === "POST /api/logout") {
      const session = getSession(req, db);
      if (session) {
        delete db.sessions[session.token];
        writeDb(db);
      }
      clearSessionCookie(res);
      json(res, 200, { ok: true });
      return;
    }

    if (reqUrl.pathname.startsWith("/api/download/") && req.method === "GET") {
      const user = requireUser(req, res, db);
      if (!user) return;
      const resourceId = reqUrl.pathname.split("/").pop();
      const resource = db.resources.find((item) => item.id === resourceId);
      const filePath = resourceForDownload(resource);
      if (!filePath) {
        fail(res, 404, "File not found.");
        return;
      }
      serveFile(res, filePath, resource.fileName || resource.title);
      return;
    }

    const user = requireUser(req, res, db);
    if (!user) return;

    if (route === "GET /api/state") {
      json(res, 200, decorate(db, user));
      return;
    }

    if (route === "POST /api/folders") {
      const payload = await readJson(req);
      const name = normalizeFolderName(payload.name);
      if (!name || name.length < 2) {
        fail(res, 400, "Add a folder name.");
        return;
      }
      const before = db.folders.length;
      ensureFolder(db, name, user.id);
      if (db.folders.length === before) {
        fail(res, 409, "That folder already exists.");
        return;
      }
      writeDb(db);
      json(res, 201, decorate(db, user));
      return;
    }

    if (route === "POST /api/resources") {
      const payload = await readJson(req);
      const type = String(payload.type || "").trim();
      const title = String(payload.title || "").trim().slice(0, 120);
      const subject = ensureFolder(db, payload.subject, user.id).name;
      const description = String(payload.description || "").trim().slice(0, 800);
      if (!validResourceType(type)) {
        fail(res, 400, "Choose a valid resource type.");
        return;
      }
      if (!title) {
        fail(res, 400, "Add a title.");
        return;
      }

      const resource = {
        id: id("res"),
        type,
        title,
        subject,
        description,
        tags: normalizeTags(payload.tags),
        authorId: user.id,
        pinned: Boolean(payload.pinned),
        createdAt: now(),
        updatedAt: now(),
      };

      if (type === "link") {
        const linkUrl = String(payload.url || "").trim();
        try {
          const parsed = new URL(linkUrl);
          if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Invalid protocol");
          resource.url = parsed.toString();
        } catch {
          fail(res, 400, "Add a valid http or https link.");
          return;
        }
      }

      if (type === "text" || type === "prompt") {
        const content = String(payload.content || "").trim();
        if (!content) {
          fail(res, 400, "Add the text or prompt content.");
          return;
        }
        resource.content = content.slice(0, 20000);
      }

      if (type === "file") {
        const file = payload.file || {};
        const base64 = String(file.data || "");
        const originalName = sanitizeName(file.name || title);
        if (!base64) {
          fail(res, 400, "Choose a file to upload.");
          return;
        }
        const buffer = Buffer.from(base64, "base64");
        const ext = path.extname(originalName).slice(0, 20);
        const storedName = `${resource.id}${ext}`;
        fs.writeFileSync(path.join(UPLOAD_DIR, storedName), buffer);
        resource.filePath = storedName;
        resource.fileName = originalName;
        resource.fileSize = buffer.length;
        resource.mime = String(file.mime || "application/octet-stream").slice(0, 120);
      }

      db.resources.push(resource);
      writeDb(db);
      json(res, 201, decorate(db, user));
      return;
    }

    const resourceMatch = reqUrl.pathname.match(/^\/api\/resources\/([^/]+)$/);
    if (resourceMatch && req.method === "PUT") {
      const payload = await readJson(req);
      const resource = db.resources.find((item) => item.id === resourceMatch[1]);
      if (!resource) {
        fail(res, 404, "Resource not found.");
        return;
      }
      if (resource.authorId !== user.id) {
        fail(res, 403, "Only the student who uploaded this can edit it.");
        return;
      }
      const title = String(payload.title || "").trim().slice(0, 120);
      if (!title) {
        fail(res, 400, "Add a title.");
        return;
      }
      resource.title = title;
      resource.subject = ensureFolder(db, payload.subject, user.id).name;
      resource.description = String(payload.description || "").trim().slice(0, 800);
      resource.tags = normalizeTags(payload.tags);
      resource.pinned = Boolean(payload.pinned);
      if (resource.type === "link") {
        const linkUrl = String(payload.url || "").trim();
        try {
          const parsed = new URL(linkUrl);
          if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Invalid protocol");
          resource.url = parsed.toString();
        } catch {
          fail(res, 400, "Add a valid http or https link.");
          return;
        }
      }
      if (resource.type === "text" || resource.type === "prompt") {
        const content = String(payload.content || "").trim();
        if (!content) {
          fail(res, 400, "Add the text or prompt content.");
          return;
        }
        resource.content = content.slice(0, 20000);
      }
      resource.updatedAt = now();
      writeDb(db);
      json(res, 200, decorate(db, user));
      return;
    }

    if (resourceMatch && req.method === "DELETE") {
      const resource = db.resources.find((item) => item.id === resourceMatch[1]);
      if (!resource) {
        fail(res, 404, "Resource not found.");
        return;
      }
      if (resource.authorId !== user.id) {
        fail(res, 403, "Only the student who uploaded this can delete it.");
        return;
      }
      const filePath = resourceForDownload(resource);
      db.resources = db.resources.filter((item) => item.id !== resource.id);
      db.comments = db.comments.filter((item) => item.resourceId !== resource.id);
      for (const userId of Object.keys(db.bookmarks)) {
        db.bookmarks[userId] = db.bookmarks[userId].filter((idValue) => idValue !== resource.id);
      }
      writeDb(db);
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      json(res, 200, decorate(db, user));
      return;
    }

    const commentMatch = reqUrl.pathname.match(/^\/api\/resources\/([^/]+)\/comments$/);
    if (commentMatch && req.method === "POST") {
      const resource = db.resources.find((item) => item.id === commentMatch[1]);
      const body = String((await readJson(req)).body || "").trim().slice(0, 1200);
      if (!resource) {
        fail(res, 404, "Resource not found.");
        return;
      }
      if (!body) {
        fail(res, 400, "Comment cannot be empty.");
        return;
      }
      db.comments.push({ id: id("com"), resourceId: resource.id, authorId: user.id, body, createdAt: now() });
      writeDb(db);
      json(res, 201, decorate(db, user));
      return;
    }

    const commentDelete = reqUrl.pathname.match(/^\/api\/comments\/([^/]+)$/);
    if (commentDelete && req.method === "DELETE") {
      const comment = db.comments.find((item) => item.id === commentDelete[1]);
      if (!comment) {
        fail(res, 404, "Comment not found.");
        return;
      }
      if (comment.authorId !== user.id) {
        fail(res, 403, "Only the student who wrote this comment can delete it.");
        return;
      }
      db.comments = db.comments.filter((item) => item.id !== comment.id);
      writeDb(db);
      json(res, 200, decorate(db, user));
      return;
    }

    const bookmarkMatch = reqUrl.pathname.match(/^\/api\/resources\/([^/]+)\/bookmark$/);
    if (bookmarkMatch && req.method === "POST") {
      const resource = db.resources.find((item) => item.id === bookmarkMatch[1]);
      if (!resource) {
        fail(res, 404, "Resource not found.");
        return;
      }
      const current = new Set(db.bookmarks[user.id] || []);
      if (current.has(resource.id)) current.delete(resource.id);
      else current.add(resource.id);
      db.bookmarks[user.id] = [...current];
      writeDb(db);
      json(res, 200, decorate(db, user));
      return;
    }

    if (route === "POST /api/requests") {
      const payload = await readJson(req);
      const title = String(payload.title || "").trim().slice(0, 120);
      const details = String(payload.details || "").trim().slice(0, 1000);
      if (!title) {
        fail(res, 400, "Add what you need.");
        return;
      }
      db.requests.push({
        id: id("req"),
        title,
        details,
        subject: ensureFolder(db, payload.subject, user.id).name,
        authorId: user.id,
        fulfilled: false,
        createdAt: now(),
      });
      writeDb(db);
      json(res, 201, decorate(db, user));
      return;
    }

    const requestMatch = reqUrl.pathname.match(/^\/api\/requests\/([^/]+)$/);
    if (requestMatch && req.method === "PATCH") {
      const request = db.requests.find((item) => item.id === requestMatch[1]);
      if (!request) {
        fail(res, 404, "Request not found.");
        return;
      }
      if (request.authorId !== user.id) {
        fail(res, 403, "Only the student who made this request can update it.");
        return;
      }
      request.fulfilled = Boolean((await readJson(req)).fulfilled);
      writeDb(db);
      json(res, 200, decorate(db, user));
      return;
    }

    if (requestMatch && req.method === "DELETE") {
      const request = db.requests.find((item) => item.id === requestMatch[1]);
      if (!request) {
        fail(res, 404, "Request not found.");
        return;
      }
      if (request.authorId !== user.id) {
        fail(res, 403, "Only the student who made this request can delete it.");
        return;
      }
      db.requests = db.requests.filter((item) => item.id !== request.id);
      writeDb(db);
      json(res, 200, decorate(db, user));
      return;
    }

    if (route === "POST /api/announcements") {
      const text = String((await readJson(req)).text || "").trim().slice(0, 600);
      if (!text) {
        fail(res, 400, "Announcement cannot be empty.");
        return;
      }
      db.announcements.push({ id: id("ann"), text, authorId: user.id, createdAt: now() });
      writeDb(db);
      json(res, 201, decorate(db, user));
      return;
    }

    const announcementMatch = reqUrl.pathname.match(/^\/api\/announcements\/([^/]+)$/);
    if (announcementMatch && req.method === "DELETE") {
      const announcement = db.announcements.find((item) => item.id === announcementMatch[1]);
      if (!announcement) {
        fail(res, 404, "Announcement not found.");
        return;
      }
      if (announcement.authorId !== user.id) {
        fail(res, 403, "Only the student who posted this announcement can delete it.");
        return;
      }
      db.announcements = db.announcements.filter((item) => item.id !== announcement.id);
      writeDb(db);
      json(res, 200, decorate(db, user));
      return;
    }

    fail(res, 404, "API route not found.");
  } catch (error) {
    fail(res, 500, error.message);
  }
}

ensureStore();

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  if (reqUrl.pathname.startsWith("/api/")) {
    handleApi(req, res, reqUrl);
    return;
  }
  if (req.method !== "GET") {
    fail(res, 405, "Method not allowed.");
    return;
  }
  serveStatic(req, res, reqUrl);
});

server.listen(PORT, HOST, () => {
  console.log(`Class Resource Hub running at http://${HOST}:${PORT}`);
  console.log(`Class invite code: ${CLASS_CODE}`);
});
