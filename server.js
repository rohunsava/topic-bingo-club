import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const roomsPath = path.join(dataDir, "rooms.json");
const port = Number(process.env.PORT || 4315);
const roomLifetimeMs = 1000 * 60 * 60 * 24 * 7;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const stopWords = new Set([
  "a",
  "about",
  "after",
  "all",
  "an",
  "and",
  "any",
  "are",
  "around",
  "at",
  "away",
  "be",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "over",
  "that",
  "the",
  "their",
  "this",
  "to",
  "up",
  "with",
  "your"
]);

const noisySuggestionFragments = [
  "season",
  "episode",
  "list of",
  "disambiguation",
  "tv series",
  "television",
  "american",
  "country",
  "practices",
  "vary",
  "expected",
  "through",
  "together"
];

const genericNoiseWords = new Set([
  "10th",
  "2nd",
  "associated",
  "baby",
  "birth",
  "but",
  "canadian",
  "celebrate",
  "celebrates",
  "celebration",
  "child",
  "days",
  "delivery",
  "endorsement",
  "exist",
  "giving",
  "gifts",
  "greatly",
  "holiday",
  "office",
  "often",
  "party",
  "passage",
  "prenatal",
  "product",
  "run",
  "runs",
  "schedule",
  "series",
  "seinfeld",
  "shower",
  "similar",
  "sla",
  "spending",
  "support",
  "the office",
  "the baby shower",
  "time",
  "unit",
  "user",
  "while",
  "working day"
]);

const topicPresets = [
  {
    test: /baby shower/i,
    words: [
      "Diaper cake",
      "Onesies",
      "Gift registry",
      "Cupcakes",
      "Pastel balloons",
      "Nursery theme",
      "Baby name debate",
      "Advice cards",
      "Pacifiers",
      "Photo banner",
      "Keepsake book",
      "Tiny socks"
    ]
  },
  {
    test: /funeral|memorial|celebration of life/i,
    words: [
      "Guestbook",
      "Flower arrangement",
      "Eulogy",
      "Condolence card",
      "Prayer card",
      "Reception",
      "Photo collage",
      "Memory table",
      "Quiet hug",
      "Candlelight",
      "Family tribute",
      "Shared story"
    ]
  },
  {
    test: /carnival|fair/i,
    words: [
      "Ferris wheel",
      "Cotton candy",
      "Ticket booth",
      "Prize stand",
      "Ring toss",
      "Face paint",
      "Popcorn",
      "Game barker",
      "Carousel",
      "Funnel cake",
      "Crowd cheer",
      "Lucky win"
    ]
  },
  {
    test: /support|help desk|customer success|product support/i,
    words: [
      "Escalation",
      "Ticket queue",
      "Knowledge base",
      "Customer handoff",
      "SLA mention",
      "Screen share",
      "Follow-up email",
      "Priority issue",
      "Case update",
      "Root cause",
      "Bug report",
      "Resolution note"
    ]
  },
  {
    test: /birthday|party|celebration/i,
    words: [
      "Birthday cake",
      "Candles",
      "Party hats",
      "Photo moment",
      "Surprise guest",
      "Goodie bag",
      "Playlist favorite",
      "Wish speech",
      "Group selfie",
      "Confetti",
      "Snack table",
      "Big laugh"
    ]
  }
];

const bingoLines = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20]
];

let state = { rooms: [] };
let saveQueue = Promise.resolve();

await ensureStorage();
state = await loadState();
pruneExpiredRooms();

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);

    if (requestUrl.pathname.startsWith("/api/")) {
      await handleApi(req, res, requestUrl);
      return;
    }

    await serveStatic(requestUrl.pathname, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Something went wrong on the server." });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Topic Bingo Club is running on http://127.0.0.1:${port}`);
});

async function ensureStorage() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(roomsPath);
  } catch {
    await fs.writeFile(roomsPath, JSON.stringify({ rooms: [] }, null, 2));
  }
}

async function loadState() {
  const raw = await fs.readFile(roomsPath, "utf8");
  const parsed = JSON.parse(raw);
  return {
    rooms: Array.isArray(parsed.rooms) ? parsed.rooms : []
  };
}

function saveState() {
  saveQueue = saveQueue.then(() =>
    fs.writeFile(roomsPath, JSON.stringify(state, null, 2), "utf8")
  );
  return saveQueue;
}

async function handleApi(req, res, requestUrl) {
  if (req.method === "GET" && requestUrl.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, roomCount: state.rooms.length });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/suggestions") {
    const topic = cleanText(requestUrl.searchParams.get("topic"), 60);
    if (!topic) {
      sendJson(res, 400, { error: "Add a topic first." });
      return;
    }

    const result = await generateSuggestions(topic);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/rooms/create") {
    const body = await parseJson(req);
    const topic = cleanText(body.topic, 60);
    const hostName = cleanText(body.hostName, 30) || "Host";
    const roomName = cleanText(body.roomName, 40) || `${topic || "Topic"} Bingo`;
    const password = cleanText(body.password, 80);
    const wordPool = buildWordPool(body.suggestedWords, body.manualWords);

    if (!topic) {
      sendJson(res, 400, { error: "Pick a topic before creating a room." });
      return;
    }

    if (!password || password.length < 4) {
      sendJson(res, 400, { error: "Use a room password with at least 4 characters." });
      return;
    }

    if (wordPool.length < 24) {
      sendJson(res, 400, {
        error: `You need ${24 - wordPool.length} more unique words to build a room board set.`,
        wordCount: wordPool.length
      });
      return;
    }

    pruneExpiredRooms();

    const roomCode = generateRoomCode();
    const passwordRecord = hashPassword(password);
    const player = createPlayer(hostName, wordPool);
    const now = new Date().toISOString();

    const room = {
      code: roomCode,
      name: roomName,
      topic,
      wordPool,
      passwordHash: passwordRecord.hash,
      passwordSalt: passwordRecord.salt,
      createdAt: now,
      updatedAt: now,
      hostPlayerId: player.id,
      players: [player]
    };

    state.rooms.push(room);
    await saveState();

    sendJson(res, 201, serializeRoom(room, player.token, true));
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/rooms/join") {
    const body = await parseJson(req);
    const roomCode = cleanRoomCode(body.roomCode);
    const password = cleanText(body.password, 80);
    const playerName = cleanText(body.playerName, 30) || "Guest";
    const room = getRoom(roomCode);

    if (!room) {
      sendJson(res, 404, { error: "That room code does not exist." });
      return;
    }

    if (!verifyPassword(password, room.passwordSalt, room.passwordHash)) {
      sendJson(res, 401, { error: "That password did not match the room." });
      return;
    }

    const player = createPlayer(playerName, room.wordPool);
    room.players.push(player);
    room.updatedAt = new Date().toISOString();
    await saveState();

    sendJson(res, 200, serializeRoom(room, player.token, false));
    return;
  }

  const roomStateMatch = requestUrl.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})\/state$/);
  if (req.method === "GET" && roomStateMatch) {
    const room = getRoom(roomStateMatch[1]);
    const token = requestUrl.searchParams.get("token") || "";
    const player = room ? getPlayerByToken(room, token) : null;

    if (!room || !player) {
      sendJson(res, 404, { error: "Your room session could not be found." });
      return;
    }

    player.lastSeenAt = new Date().toISOString();
    room.updatedAt = player.lastSeenAt;
    await saveState();

    sendJson(res, 200, serializeRoom(room, token, room.hostPlayerId === player.id));
    return;
  }

  const roomMarkMatch = requestUrl.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})\/mark$/);
  if (req.method === "POST" && roomMarkMatch) {
    const body = await parseJson(req);
    const room = getRoom(roomMarkMatch[1]);
    const player = room ? getPlayerByToken(room, body.token) : null;
    const index = Number(body.index);

    if (!room || !player) {
      sendJson(res, 404, { error: "Your room session could not be found." });
      return;
    }

    if (!Number.isInteger(index) || index < 0 || index > 24 || index === 12) {
      sendJson(res, 400, { error: "That bingo square is invalid." });
      return;
    }

    player.marks[index] = !player.marks[index];
    if (!hasBingo(player.marks)) {
      player.claimedBingo = false;
    }
    player.lastSeenAt = new Date().toISOString();
    room.updatedAt = player.lastSeenAt;
    await saveState();

    sendJson(res, 200, serializeRoom(room, player.token, room.hostPlayerId === player.id));
    return;
  }

  const roomBingoMatch = requestUrl.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})\/bingo$/);
  if (req.method === "POST" && roomBingoMatch) {
    const body = await parseJson(req);
    const room = getRoom(roomBingoMatch[1]);
    const player = room ? getPlayerByToken(room, body.token) : null;

    if (!room || !player) {
      sendJson(res, 404, { error: "Your room session could not be found." });
      return;
    }

    if (!hasBingo(player.marks)) {
      sendJson(res, 400, { error: "You need a full bingo line before you can call it." });
      return;
    }

    player.claimedBingo = true;
    player.lastSeenAt = new Date().toISOString();
    room.updatedAt = player.lastSeenAt;
    await saveState();

    sendJson(res, 200, serializeRoom(room, player.token, room.hostPlayerId === player.id));
    return;
  }

  sendJson(res, 404, { error: "Route not found." });
}

async function parseJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(requestPath, res) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const assetPath = path.normalize(path.join(publicDir, safePath));

  if (!assetPath.startsWith(publicDir)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const stat = await fs.stat(assetPath);
    if (stat.isFile()) {
      const ext = path.extname(assetPath);
      const content = await fs.readFile(assetPath);
      res.writeHead(200, {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600"
      });
      res.end(content);
      return;
    }
  } catch {}

  const indexPath = path.join(publicDir, "index.html");
  const content = await fs.readFile(indexPath);
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache"
  });
  res.end(content);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function cleanText(value, maxLength = 60) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanRoomCode(value) {
  return cleanText(value, 12).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function normalizeWord(value) {
  return cleanText(value, 48).replace(/[.,!?;:]+$/g, "");
}

function buildWordPool(generatedWords = [], manualWords = []) {
  const seen = new Set();
  const output = [];
  const combined = [
    ...(Array.isArray(generatedWords) ? generatedWords : []),
    ...(Array.isArray(manualWords) ? manualWords : [])
  ];

  for (const item of combined) {
    const cleaned = normalizeWord(item);
    const key = cleaned.toLowerCase();
    if (!cleaned || cleaned.length < 2 || seen.has(key)) continue;
    seen.add(key);
    output.push(cleaned);
  }

  return output;
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function buildBoard(wordPool) {
  const selections = shuffle(wordPool).slice(0, 24);
  const cells = [];
  let wordIndex = 0;

  for (let index = 0; index < 25; index += 1) {
    if (index === 12) {
      cells.push({ label: "FREE SPACE", free: true });
      continue;
    }

    cells.push({
      label: selections[wordIndex],
      free: false
    });
    wordIndex += 1;
  }

  return cells;
}

function createPlayer(name, wordPool) {
  return {
    id: crypto.randomUUID(),
    token: crypto.randomUUID(),
    name,
    board: buildBoard(wordPool),
    marks: Array.from({ length: 25 }, (_, index) => index === 12),
    claimedBingo: false,
    joinedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString()
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  if (!password || !salt || !expectedHash) return false;
  const calculated = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(
    Buffer.from(calculated, "hex"),
    Buffer.from(expectedHash, "hex")
  );
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  while (true) {
    let code = "";
    for (let index = 0; index < 6; index += 1) {
      code += alphabet[crypto.randomInt(alphabet.length)];
    }
    if (!state.rooms.some((room) => room.code === code)) {
      return code;
    }
  }
}

function getRoom(code) {
  pruneExpiredRooms();
  return state.rooms.find((room) => room.code === code) || null;
}

function getPlayerByToken(room, token) {
  if (!token) return null;
  return room.players.find((player) => player.token === token) || null;
}

function hasBingo(marks) {
  return bingoLines.some((line) => line.every((index) => marks[index]));
}

function winningLineIndexes(marks) {
  return bingoLines.filter((line) => line.every((index) => marks[index])).flat();
}

function serializeRoom(room, token, isHost) {
  const player = getPlayerByToken(room, token);
  return {
    room: {
      code: room.code,
      name: room.name,
      topic: room.topic,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      wordPoolSize: room.wordPool.length
    },
    player: player
      ? {
          id: player.id,
          name: player.name,
          token: player.token,
          board: player.board,
          marks: player.marks,
          claimedBingo: player.claimedBingo,
          winningIndexes: winningLineIndexes(player.marks)
        }
      : null,
    players: room.players
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        joinedAt: entry.joinedAt,
        lastSeenAt: entry.lastSeenAt,
        markedCount: entry.marks.filter(Boolean).length,
        hasBingo: hasBingo(entry.marks),
        claimedBingo: entry.claimedBingo
      }))
      .sort((left, right) => left.joinedAt.localeCompare(right.joinedAt)),
    isHost
  };
}

function pruneExpiredRooms() {
  const cutoff = Date.now() - roomLifetimeMs;
  const before = state.rooms.length;
  state.rooms = state.rooms.filter((room) => {
    const updatedAt = Date.parse(room.updatedAt || room.createdAt || 0);
    return updatedAt >= cutoff;
  });

  if (state.rooms.length !== before) {
    saveState().catch((error) => {
      console.error("Failed to prune rooms", error);
    });
  }
}

async function generateSuggestions(topic) {
  const sourceNotes = [];
  const buckets = [];
  const presetWords = getPresetWords(topic);

  if (presetWords.length) {
    buckets.push(...presetWords);
    sourceNotes.push("topic presets");
  }

  const wikiResult = await fetchWikipediaSuggestions(topic);
  if (wikiResult.words.length) {
    buckets.push(...wikiResult.words);
    sourceNotes.push("Wikipedia");
  }

  const datamuseResult = await fetchDatamuseSuggestions(topic);
  if (datamuseResult.words.length) {
    buckets.push(...datamuseResult.words);
    sourceNotes.push("Datamuse");
  }

  const localTopicWords = extractTopicWords(topic);
  buckets.push(...localTopicWords);

  const filtered = filterSuggestionWords(buckets, topic);
  const words = buildWordPool(filtered, []).slice(0, 48);

  return {
    topic,
    words,
    sourceNotes,
    needsManualWords: words.length < 24,
    suggestedManualMinimum: 5,
    message: words.length
      ? `Pulled ${words.length} topic words from the web. You can still add your own before building the board.`
      : "I couldn't gather enough topic words from the web, so add at least 5 custom words and keep building from there."
  };
}

async function fetchWikipediaSuggestions(topic) {
  try {
    const searchUrl = `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(topic)}&limit=8`;
    const searchResponse = await fetch(searchUrl, {
      headers: { "user-agent": "topic-bingo-club/1.0" }
    });

    if (!searchResponse.ok) {
      return { words: [] };
    }

    const searchData = await searchResponse.json();
    const pages = Array.isArray(searchData.pages) ? searchData.pages : [];
    const baseTexts = [];
    const titles = pages.map((page) => cleanText(page.title, 80)).filter(Boolean);

    for (const page of pages.slice(0, 3)) {
      if (page.title) {
        baseTexts.push(page.title);
      }
      if (page.description) {
        baseTexts.push(page.description);
      }
      if (page.excerpt) {
        baseTexts.push(page.excerpt.replace(/<[^>]+>/g, " "));
      }
    }

    const summaryResults = await Promise.all(
      titles.slice(0, 3).map(async (title) => {
        try {
          const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
          const summaryResponse = await fetch(summaryUrl, {
            headers: { "user-agent": "topic-bingo-club/1.0" }
          });
          if (!summaryResponse.ok) return "";
          const summary = await summaryResponse.json();
          return `${summary.title || ""}. ${summary.description || ""}. ${summary.extract || ""}`;
        } catch {
          return "";
        }
      })
    );

    const phrases = [
      ...titles,
      ...extractPhrases(baseTexts.join(". "), topic),
      ...extractPhrases(summaryResults.join(". "), topic)
    ];

    return { words: buildWordPool(phrases, []) };
  } catch {
    return { words: [] };
  }
}

async function fetchDatamuseSuggestions(topic) {
  try {
    const response = await fetch(
      `https://api.datamuse.com/words?ml=${encodeURIComponent(topic)}&max=30`
    );

    if (!response.ok) {
      return { words: [] };
    }

    const data = await response.json();
    const words = Array.isArray(data)
      ? data.map((entry) => cleanText(entry.word, 40)).filter(Boolean)
      : [];

    return { words };
  } catch {
    return { words: [] };
  }
}

function extractTopicWords(topic) {
  const parts = cleanText(topic, 80)
    .split(/[\s/,-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 2 && !stopWords.has(part.toLowerCase()));

  return parts;
}

function getPresetWords(topic) {
  return topicPresets
    .filter((preset) => preset.test.test(topic))
    .flatMap((preset) => preset.words);
}

function filterSuggestionWords(words, topic) {
  const normalizedTopic = cleanText(topic, 80).toLowerCase();
  const topicTokens = normalizedTopic.split(/\s+/).filter(Boolean);
  return (Array.isArray(words) ? words : []).filter((word) => {
    const cleaned = cleanText(word, 48);
    const lower = cleaned.toLowerCase();
    const rawTokens = cleaned.split(/\s+/).filter(Boolean);
    if (!cleaned) return false;
    if (cleaned.length < 3) return false;
    if (/^\d+$/.test(cleaned)) return false;
    if (/[()[\]{}]/.test(cleaned)) return false;
    if (/\d/.test(cleaned) && cleaned.split(" ").length > 1) return false;
    if (noisySuggestionFragments.some((fragment) => lower.includes(fragment))) return false;
    if (genericNoiseWords.has(lower)) return false;
    if (lower === normalizedTopic) return true;
    if (lower.startsWith("the ") && !topicTokens.some((token) => lower.includes(token))) return false;
    if (lower.startsWith("and ") || lower.startsWith("at ")) return false;
    if (lower.includes(" apartment")) return false;
    if (
      rawTokens.length >= 2 &&
      rawTokens.length <= 3 &&
      rawTokens.every((token) => /^[A-Z][a-z]+$/.test(token)) &&
      !topicTokens.some((token) => lower.includes(token))
    ) {
      return false;
    }

    const tokens = lower.split(/\s+/).filter(Boolean);
    if (!tokens.length) return false;
    if (tokens.every((token) => stopWords.has(token))) return false;
    if (tokens.length === 1 && stopWords.has(tokens[0])) return false;
    if (tokens.length === 1 && !topicTokens.includes(tokens[0])) return false;

    return true;
  });
}

function extractPhrases(text, topic) {
  const normalizedTopic = cleanText(topic, 80).toLowerCase();
  const phrases = [];
  const chunks = text
    .replace(/[\n\r]/g, " ")
    .split(/[.?!;:]+/)
    .flatMap((entry) => entry.split(/,|\(|\)|\u2022| - /));

  for (const chunk of chunks) {
    const cleaned = chunk
      .replace(/<[^>]+>/g, " ")
      .replace(/[^a-zA-Z0-9/&' -]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleaned) continue;

    const words = cleaned.split(" ").filter(Boolean);
    if (!words.length) continue;

    if (words.length <= 4) {
      const phrase = words.join(" ");
      if (phrase.toLowerCase() !== normalizedTopic) {
        phrases.push(phrase);
      }
    }
  }

  return phrases;
}
