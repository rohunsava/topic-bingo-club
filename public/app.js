const themes = {
  sunset: {
    name: "Sunset Paper",
    bg: "#f3efe5",
    bgStrong: "#fffaf2",
    surface: "rgba(255, 251, 244, 0.72)",
    surfaceStrong: "rgba(255, 255, 255, 0.84)",
    surfaceSolid: "#fffdf9",
    line: "rgba(53, 71, 91, 0.18)",
    text: "#1f2937",
    muted: "#556173",
    accent: "#d46d4a",
    accentStrong: "#8c351a",
    accentSoft: "rgba(212, 109, 74, 0.16)",
    success: "#2b8a67",
    swatch: ["#f8d8bf", "#d46d4a", "#376f64"]
  },
  harbor: {
    name: "Harbor Night",
    bg: "#e7f0f2",
    bgStrong: "#f8fdff",
    surface: "rgba(241, 249, 251, 0.72)",
    surfaceStrong: "rgba(255, 255, 255, 0.88)",
    surfaceSolid: "#fbfeff",
    line: "rgba(42, 79, 97, 0.18)",
    text: "#18313f",
    muted: "#4d6471",
    accent: "#1d7c91",
    accentStrong: "#0f5261",
    accentSoft: "rgba(29, 124, 145, 0.16)",
    success: "#2f8b63",
    swatch: ["#cfe5eb", "#1d7c91", "#f6a76b"]
  },
  festival: {
    name: "Festival Bloom",
    bg: "#fff1ec",
    bgStrong: "#fffaf8",
    surface: "rgba(255, 245, 241, 0.75)",
    surfaceStrong: "rgba(255, 255, 255, 0.9)",
    surfaceSolid: "#fffdfa",
    line: "rgba(108, 71, 89, 0.16)",
    text: "#412433",
    muted: "#6c4759",
    accent: "#e55d4f",
    accentStrong: "#9c3328",
    accentSoft: "rgba(229, 93, 79, 0.14)",
    success: "#2f8b63",
    swatch: ["#ffd6cb", "#e55d4f", "#ffbd59"]
  }
};

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

const storageKeys = {
  theme: "topic-bingo-theme",
  image: "topic-bingo-bg-image",
  name: "topic-bingo-player-name"
};

const state = {
  screen: "setup",
  mode: "single",
  multiplayerAction: "create",
  isSettingsOpen: false,
  status: {
    tone: "default",
    title: "Pick any topic to start",
    message:
      "Try a baby shower, carnival, funeral, team offsite, Product Support Days, or anything else that would be fun to play live."
  },
  setup: {
    topic: "",
    roomName: "",
    roomCode: "",
    roomPassword: "",
    playerName: localStorage.getItem(storageKeys.name) || "",
    generatedWords: [],
    selectedGeneratedWords: [],
    manualWords: Array.from({ length: 5 }, () => ""),
    sourceNotes: [],
    hasGenerated: false,
    isGenerating: false,
    stepIndex: 0
  },
  loading: {
    title: "",
    message: ""
  },
  play: {
    topic: "",
    roomName: "",
    roomCode: "",
    playerName: "",
    playerToken: "",
    board: [],
    marks: Array.from({ length: 25 }, (_, index) => index === 12),
    players: [],
    claimedBingo: false,
    winningIndexes: [],
    isMultiplayer: false,
    isHost: false,
    wordPoolSize: 0,
    updatedAt: ""
  },
  preferences: {
    theme: localStorage.getItem(storageKeys.theme) || "sunset",
    backgroundImage: localStorage.getItem(storageKeys.image) || ""
  }
};

const app = document.getElementById("app");
let syncInterval = null;

applyPreferences();
render();

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;

  if (action === "set-mode") {
    state.mode = target.dataset.mode;
    if (state.mode === "single") {
      state.multiplayerAction = "create";
    }
    normalizeSetupStep();
    state.status = {
      tone: "default",
      title: "Pick any topic to start",
      message:
        state.mode === "single"
          ? "Generate a board from the web, add your own custom words, and jump into a solo game."
          : "Choose whether you want to create a protected room or join one that is already live."
    };
    render();
  }

  if (action === "set-multiplayer-action") {
    state.multiplayerAction = target.dataset.multiplayerAction;
    normalizeSetupStep();
    state.status = {
      tone: "default",
      title:
        state.multiplayerAction === "join" ? "Join an existing room" : "Build a room for your group",
      message:
        state.multiplayerAction === "join"
          ? "Enter the room code, password, and your player name to grab your board."
          : "The host sets the topic, words, and room password before everyone joins."
    };
    render();
  }

  if (action === "toggle-generated-word") {
    const word = target.dataset.word;
    const exists = state.setup.selectedGeneratedWords.includes(word);
    state.setup.selectedGeneratedWords = exists
      ? state.setup.selectedGeneratedWords.filter((item) => item !== word)
      : [...state.setup.selectedGeneratedWords, word];
    render();
  }

  if (action === "add-manual-word") {
    state.setup.manualWords.push("");
    render();
  }

  if (action === "remove-manual-word") {
    const index = Number(target.dataset.index);
    if (state.setup.manualWords.length > 5) {
      state.setup.manualWords.splice(index, 1);
      render();
    }
  }

  if (action === "generate-topic-words") {
    await generateTopicWords();
  }

  if (action === "start-single-player") {
    await startSinglePlayer();
  }

  if (action === "create-room") {
    await createRoom();
  }

  if (action === "join-room") {
    await joinRoom();
  }

  if (action === "toggle-board-cell") {
    const index = Number(target.dataset.index);
    await toggleBoardCell(index);
  }

  if (action === "claim-bingo") {
    await claimBingo();
  }

  if (action === "open-settings") {
    state.isSettingsOpen = true;
    render();
  }

  if (action === "close-settings") {
    state.isSettingsOpen = false;
    render();
  }

  if (action === "set-theme") {
    state.preferences.theme = target.dataset.theme;
    localStorage.setItem(storageKeys.theme, state.preferences.theme);
    applyPreferences();
    render();
  }

  if (action === "clear-background") {
    state.preferences.backgroundImage = "";
    localStorage.removeItem(storageKeys.image);
    applyPreferences();
    render();
  }

  if (action === "new-game") {
    stopSync();
    state.screen = "setup";
    state.play = {
      topic: "",
      roomName: "",
      roomCode: "",
      playerName: "",
      playerToken: "",
      board: [],
      marks: Array.from({ length: 25 }, (_, index) => index === 12),
      players: [],
      claimedBingo: false,
      winningIndexes: [],
      isMultiplayer: false,
      isHost: false,
      wordPoolSize: 0,
      updatedAt: ""
    };
    state.status = {
      tone: "default",
      title: "Back to setup",
      message: "Your topic, generated words, and custom word list are still here so you can tweak and rebuild quickly."
    };
    render();
  }

  if (action === "sync-room") {
    await syncRoom();
  }

  if (action === "advance-setup") {
    await advanceSetup();
  }

  if (action === "back-setup") {
    moveToPreviousSetupStep();
  }

  if (action === "skip-web-lookup") {
    skipWebLookup();
  }
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;

  if (target.dataset.field === "topic") {
    const nextTopic = target.value;
    if (state.setup.topic !== nextTopic) {
      state.setup.generatedWords = [];
      state.setup.selectedGeneratedWords = [];
      state.setup.sourceNotes = [];
      state.setup.hasGenerated = false;
    }
    state.setup.topic = target.value;
  }

  if (target.dataset.field === "roomName") {
    state.setup.roomName = target.value;
  }

  if (target.dataset.field === "roomCode") {
    state.setup.roomCode = target.value.toUpperCase();
  }

  if (target.dataset.field === "roomPassword") {
    state.setup.roomPassword = target.value;
  }

  if (target.dataset.field === "playerName") {
    state.setup.playerName = target.value;
    localStorage.setItem(storageKeys.name, target.value);
  }

  if (target.dataset.field === "manualWord") {
    const index = Number(target.dataset.index);
    state.setup.manualWords[index] = target.value;
  }
});

document.addEventListener("change", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;

  if (target.dataset.field === "backgroundUpload") {
    const file = target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await readFileAsDataUrl(file);
      state.preferences.backgroundImage = dataUrl;
      localStorage.setItem(storageKeys.image, dataUrl);
      applyPreferences();
      state.status = {
        tone: "success",
        title: "Background updated",
        message: "Your custom image is now applied to the entire app."
      };
      render();
    } catch {
      state.status = {
        tone: "warning",
        title: "Image could not be saved",
        message: "Try a smaller photo if your browser storage is full."
      };
      render();
    }
  }
});

async function generateTopicWords() {
  if (!state.setup.topic.trim()) {
    state.status = {
      tone: "warning",
      title: "Add a topic first",
      message: "The app uses your topic as the starting point for web suggestions."
    };
    render();
    return;
  }

  state.setup.isGenerating = true;
  state.status = {
    tone: "default",
    title: "Searching the web for topic words",
    message: "Pulling suggestions now. You can still add your own words no matter what comes back."
  };
  render();

  try {
    const response = await fetch(`/api/suggestions?topic=${encodeURIComponent(state.setup.topic)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Word suggestions failed.");
    }

    state.setup.generatedWords = data.words || [];
    state.setup.selectedGeneratedWords = [...state.setup.generatedWords];
    state.setup.sourceNotes = data.sourceNotes || [];
    state.setup.hasGenerated = true;

    state.status = data.needsManualWords
      ? {
          tone: "warning",
          title: "Web suggestions need a little help",
          message:
            `${data.message} Add at least ${data.suggestedManualMinimum || 5} custom words now, and keep adding more until you have 24 unique board entries.`
        }
      : {
          tone: "success",
          title: "Topic words are ready",
          message: `${data.message} You can deselect any generated words and add custom ones before making the board.`
        };
  } catch (error) {
    state.setup.generatedWords = [];
    state.setup.selectedGeneratedWords = [];
    state.setup.sourceNotes = [];
    state.setup.hasGenerated = true;
    state.status = {
      tone: "warning",
      title: "The web couldn't fill this one in",
      message:
        "That topic did not return enough suggestions right now. Add at least 5 custom words to get started, then keep adding words until you reach 24 unique entries."
    };
  } finally {
    state.setup.isGenerating = false;
    render();
  }
}

function startSinglePlayer() {
  const wordPool = getSelectedWordPool();
  if (!state.setup.topic.trim()) {
    state.status = {
      tone: "warning",
      title: "Your board needs a topic",
      message: "Add the event or theme first so the board has context."
    };
    render();
    return;
  }

  if (wordPool.length < 24) {
    state.status = {
      tone: "warning",
      title: "Add more unique words",
      message: `You currently have ${wordPool.length}. A 5x5 board needs 24 words plus the free center square.`
    };
    render();
    return;
  }

  return withLoading(
    {
      title: "Generating your bingo board",
      message: "Shuffling topic words, placing the free space, and getting everything ready."
    },
    async () => {
      await sleep(2000);
      const board = buildBoard(wordPool);
      state.play = {
        topic: state.setup.topic.trim(),
        roomName: "",
        roomCode: "",
        playerName: state.setup.playerName.trim() || "Player",
        playerToken: "",
        board,
        marks: Array.from({ length: 25 }, (_, index) => index === 12),
        players: [],
        claimedBingo: false,
        winningIndexes: [],
        isMultiplayer: false,
        isHost: false,
        wordPoolSize: wordPool.length,
        updatedAt: new Date().toISOString()
      };
      state.screen = "play";
      state.status = {
        tone: "success",
        title: "Board ready",
        message: "Your bingo board is live. Tap squares as moments happen, then call bingo when you hit a full line."
      };
    }
  );
}

async function createRoom() {
  const wordPool = getSelectedWordPool();
  if (!state.setup.topic.trim()) {
    state.status = {
      tone: "warning",
      title: "Your room needs a topic",
      message: "Start with the event or theme the room should use."
    };
    render();
    return;
  }

  if (wordPool.length < 24) {
    state.status = {
      tone: "warning",
      title: "Add more unique words",
      message: `You currently have ${wordPool.length}. Multiplayer rooms need a 24-word pool so every player can get a full board.`
    };
    render();
    return;
  }

  if (!state.setup.roomPassword.trim()) {
    state.status = {
      tone: "warning",
      title: "Add a room password",
      message: "Passwords keep the room a little more secure before you share the code."
    };
    render();
    return;
  }

  await withLoading(
    {
      title: "Opening your multiplayer room",
      message: "Securing the room, shuffling boards, and preparing the shared session."
    },
    async () => {
      const [response] = await Promise.all([
        fetch("/api/rooms/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: state.setup.topic,
            roomName: state.setup.roomName,
            hostName: state.setup.playerName || "Host",
            password: state.setup.roomPassword,
            suggestedWords: state.setup.selectedGeneratedWords,
            manualWords: state.setup.manualWords
          })
        }),
        sleep(2200)
      ]);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Room creation failed.");
      }

      hydrateRoom(data);
      state.status = {
        tone: "success",
        title: "Room created",
        message: `Share code ${data.room.code} and your chosen password so other players can join.`
      };
      startSync();
    }
  );
}

async function joinRoom() {
  if (!state.setup.roomCode.trim() || !state.setup.roomPassword.trim()) {
    state.status = {
      tone: "warning",
      title: "Room details are missing",
      message: "Add the room code and password first."
    };
    render();
    return;
  }

  await withLoading(
    {
      title: "Joining the room",
      message: "Checking the password, pulling your board, and syncing the room roster."
    },
    async () => {
      const [response] = await Promise.all([
        fetch("/api/rooms/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomCode: state.setup.roomCode,
            password: state.setup.roomPassword,
            playerName: state.setup.playerName || "Guest"
          })
        }),
        sleep(2200)
      ]);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Room join failed.");
      }

      hydrateRoom(data);
      state.status = {
        tone: "success",
        title: "You are in",
        message: `Room ${data.room.code} is ready. Your board was generated from the host's topic word pool.`
      };
      startSync();
    }
  );
}

async function toggleBoardCell(index) {
  if (index === 12) return;

  if (!state.play.isMultiplayer) {
    state.play.marks[index] = !state.play.marks[index];
    state.play.winningIndexes = getWinningIndexes(state.play.marks);
    if (!state.play.winningIndexes.length) {
      state.play.claimedBingo = false;
    }
    render();
    return;
  }

  try {
    const response = await fetch(`/api/rooms/${state.play.roomCode}/mark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: state.play.playerToken,
        index
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not mark the square.");
    }
    hydrateRoom(data);
    render();
  } catch (error) {
    state.status = {
      tone: "warning",
      title: "Square update failed",
      message: error.message
    };
    render();
  }
}

async function claimBingo() {
  const winningIndexes = getWinningIndexes(state.play.marks);

  if (!winningIndexes.length) {
    state.status = {
      tone: "warning",
      title: "Not quite bingo yet",
      message: "Finish a full row, column, or diagonal before calling bingo."
    };
    render();
    return;
  }

  if (!state.play.isMultiplayer) {
    state.play.claimedBingo = true;
    state.play.winningIndexes = winningIndexes;
    state.status = {
      tone: "success",
      title: "Bingo",
      message: "You hit a full line. Keep playing or build a fresh board whenever you want."
    };
    render();
    return;
  }

  try {
    const response = await fetch(`/api/rooms/${state.play.roomCode}/bingo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: state.play.playerToken
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not claim bingo.");
    }
    hydrateRoom(data);
    state.status = {
      tone: "success",
      title: "Bingo called",
      message: "The room can now see your winning card."
    };
    render();
  } catch (error) {
    state.status = {
      tone: "warning",
      title: "Bingo claim failed",
      message: error.message
    };
    render();
  }
}

async function syncRoom() {
  if (!state.play.isMultiplayer || !state.play.roomCode || !state.play.playerToken) return;

  try {
    const response = await fetch(
      `/api/rooms/${state.play.roomCode}/state?token=${encodeURIComponent(state.play.playerToken)}`
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Room sync failed.");
    }
    hydrateRoom(data);
    render();
  } catch (error) {
    state.status = {
      tone: "warning",
      title: "Room sync paused",
      message: error.message
    };
    stopSync();
    render();
  }
}

function hydrateRoom(data) {
  state.screen = "play";
  state.play = {
    topic: data.room.topic,
    roomName: data.room.name,
    roomCode: data.room.code,
    playerName: data.player.name,
    playerToken: data.player.token,
    board: data.player.board,
    marks: data.player.marks,
    players: data.players,
    claimedBingo: data.player.claimedBingo,
    winningIndexes: data.player.winningIndexes || [],
    isMultiplayer: true,
    isHost: Boolean(data.isHost),
    wordPoolSize: data.room.wordPoolSize,
    updatedAt: data.room.updatedAt
  };
}

function startSync() {
  stopSync();
  syncInterval = window.setInterval(syncRoom, 4000);
}

function stopSync() {
  if (syncInterval) {
    window.clearInterval(syncInterval);
    syncInterval = null;
  }
}

function getSelectedWordPool() {
  const seen = new Set();
  const all = [];

  for (const word of state.setup.selectedGeneratedWords) {
    const cleaned = sanitizeWord(word);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    all.push(cleaned);
  }

  for (const word of state.setup.manualWords) {
    const cleaned = sanitizeWord(word);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    all.push(cleaned);
  }

  return all;
}

function sanitizeWord(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 48);
}

function buildBoard(wordPool) {
  const pool = shuffle(wordPool).slice(0, 24);
  const board = [];
  let offset = 0;

  for (let index = 0; index < 25; index += 1) {
    if (index === 12) {
      board.push({ label: "FREE SPACE", free: true });
      continue;
    }
    board.push({ label: pool[offset], free: false });
    offset += 1;
  }

  return board;
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function getWinningIndexes(marks) {
  return bingoLines.filter((line) => line.every((index) => marks[index])).flat();
}

function getSetupFlow() {
  const flow = ["mode"];

  if (state.mode === "multiplayer") {
    flow.push("multiplayerAction");
  }

  const isJoinFlow = state.mode === "multiplayer" && state.multiplayerAction === "join";

  if (isJoinFlow) {
    flow.push("roomCode", "roomPassword", "playerName", "readyJoin");
    return flow;
  }

  flow.push("topic", "playerName");

  if (state.mode === "multiplayer") {
    flow.push("roomName", "roomPassword");
  }

  flow.push("generateWords", "wordBank", "readyBuild");
  return flow;
}

function normalizeSetupStep() {
  const steps = getSetupFlow();
  state.setup.stepIndex = Math.max(0, Math.min(state.setup.stepIndex, steps.length - 1));
}

function getCurrentSetupStepId() {
  normalizeSetupStep();
  const steps = getSetupFlow();
  return steps[state.setup.stepIndex];
}

function moveToNextSetupStep() {
  const steps = getSetupFlow();
  state.setup.stepIndex = Math.min(state.setup.stepIndex + 1, steps.length - 1);
  render();
}

function moveToPreviousSetupStep() {
  state.setup.stepIndex = Math.max(state.setup.stepIndex - 1, 0);
  render();
}

function getSetupProgressPercent() {
  const totalSteps = getSetupFlow().length;
  if (totalSteps <= 1) return 0;
  return Math.round((state.setup.stepIndex / (totalSteps - 1)) * 100);
}

async function advanceSetup() {
  const stepId = getCurrentSetupStepId();
  const wordPool = getSelectedWordPool();

  if (stepId === "mode") {
    moveToNextSetupStep();
    return;
  }

  if (stepId === "multiplayerAction") {
    moveToNextSetupStep();
    return;
  }

  if (stepId === "topic") {
    if (!state.setup.topic.trim()) {
      state.status = {
        tone: "warning",
        title: "Add a topic first",
        message: "This is the prompt the app uses to shape the board."
      };
      render();
      return;
    }
    moveToNextSetupStep();
    return;
  }

  if (stepId === "roomCode") {
    if (state.setup.roomCode.trim().length < 4) {
      state.status = {
        tone: "warning",
        title: "Add the room code",
        message: "Use the code the host shared with you so the app knows which room to join."
      };
      render();
      return;
    }
    moveToNextSetupStep();
    return;
  }

  if (stepId === "roomPassword") {
    if (!state.setup.roomPassword.trim()) {
      state.status = {
        tone: "warning",
        title: "Add the room password",
        message: "The room password is required before the app can move forward."
      };
      render();
      return;
    }
    moveToNextSetupStep();
    return;
  }

  if (stepId === "generateWords") {
    await generateTopicWords();
    moveToNextSetupStep();
    return;
  }

  if (stepId === "wordBank") {
    if (wordPool.length < 24) {
      state.status = {
        tone: "warning",
        title: "Add more unique words",
        message: `You currently have ${wordPool.length}. A full bingo board needs 24 words plus the free center square.`
      };
      render();
      return;
    }
    moveToNextSetupStep();
    return;
  }

  if (stepId === "readyBuild") {
    if (state.mode === "single") {
      await startSinglePlayer();
      return;
    }
    await createRoom();
    return;
  }

  if (stepId === "readyJoin") {
    await joinRoom();
    return;
  }

  moveToNextSetupStep();
}

function skipWebLookup() {
  state.status = {
    tone: "default",
    title: "Manual word mode",
    message: "No problem. You can keep building the word bank yourself from the next step."
  };
  moveToNextSetupStep();
}

async function withLoading(loadingState, task) {
  const previousScreen = state.screen;
  state.loading = loadingState;
  state.screen = "loading";
  render();

  try {
    await task();
    render();
  } catch (error) {
    state.screen = previousScreen;
    state.status = {
      tone: "warning",
      title: "Setup could not finish",
      message: error.message || "Something went wrong while finishing setup."
    };
    render();
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function applyPreferences() {
  const theme = themes[state.preferences.theme] || themes.sunset;
  const root = document.documentElement;
  root.style.setProperty("--bg", theme.bg);
  root.style.setProperty("--bg-strong", theme.bgStrong);
  root.style.setProperty("--surface", theme.surface);
  root.style.setProperty("--surface-strong", theme.surfaceStrong);
  root.style.setProperty("--surface-solid", theme.surfaceSolid);
  root.style.setProperty("--line", theme.line);
  root.style.setProperty("--text", theme.text);
  root.style.setProperty("--muted", theme.muted);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-strong", theme.accentStrong);
  root.style.setProperty("--accent-soft", theme.accentSoft);
  root.style.setProperty("--success", theme.success);
  root.style.setProperty(
    "--custom-bg",
    state.preferences.backgroundImage
      ? `linear-gradient(rgba(255,255,255,0.3), rgba(255,255,255,0.3)), url("${state.preferences.backgroundImage}")`
      : "none"
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function relativeTime(isoString) {
  if (!isoString) return "just now";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function render() {
  app.innerHTML = `
    <div class="page">
      <header class="topbar">
        <div class="brand-lockup">
          <div class="brand-badge">TB</div>
          <div class="brand-copy">
            <h1>Topic Bingo Club</h1>
            <p>Custom boards for any room, topic, party, or live event.</p>
          </div>
        </div>
        <div class="topbar-actions">
          ${
            state.screen === "play"
              ? `<button class="ghost-btn" data-action="new-game">New setup</button>`
              : ""
          }
          <button class="icon-btn" data-action="open-settings">Settings</button>
        </div>
      </header>

      ${state.screen === "play" ? renderPlayScreen() : state.screen === "loading" ? renderLoadingScreen() : renderSetupScreen()}
    </div>
    ${state.isSettingsOpen ? renderSettingsDrawer() : ""}
  `;
}

function renderSetupScreen() {
  normalizeSetupStep();
  const wordPool = getSelectedWordPool();
  const generatedCount = state.setup.selectedGeneratedWords.length;
  const manualCount = state.setup.manualWords.filter((word) => sanitizeWord(word)).length;
  const stepId = getCurrentSetupStepId();
  const flow = getSetupFlow();

  return `
    <main class="setup-wizard">
      <section class="hero-card wizard-shell">
        <span class="eyebrow">5x5 Bingo Builder</span>
        <h2 class="hero-title wizard-hero-title">A gentler setup flow, one question at a time.</h2>
        <div class="hero-copy wizard-copy">
          <p>Pick your topic, choose single-player or multiplayer, and let the board come together step by step instead of all at once.</p>
        </div>
        <div class="feature-row wizard-feature-row">
          <div class="pill">Free center square included</div>
          <div class="pill">Manual words always available</div>
          <div class="pill">Private rooms with passwords</div>
        </div>

        <div class="status-banner ${state.status.tone === "warning" ? "is-warning" : ""} ${state.status.tone === "success" ? "is-success" : ""}">
          <div class="status-kicker">${state.status.tone === "success" ? "OK" : state.status.tone === "warning" ? "!" : "i"}</div>
          <div>
            <strong>${escapeHtml(state.status.title)}</strong>
            <p class="status-text">${escapeHtml(state.status.message)}</p>
          </div>
        </div>

        <section class="setup-question-card" data-step="${escapeHtml(stepId)}">
          ${renderSetupStep({
            stepId,
            stepNumber: state.setup.stepIndex + 1,
            totalSteps: flow.length,
            wordPool,
            generatedCount,
            manualCount
          })}
        </section>
      </section>
      ${renderSetupProgress({ complete: false })}
    </main>
  `;
}

function renderSetupStep({ stepId, stepNumber, totalSteps, wordPool, generatedCount, manualCount }) {
  const needsWords = Math.max(0, 24 - wordPool.length);
  const backButton = state.setup.stepIndex > 0
    ? `<button class="ghost-btn" data-action="back-setup">Back</button>`
    : "";

  if (stepId === "mode") {
    return `
      <div class="setup-step-meta">Step ${stepNumber} of ${totalSteps}</div>
      <h3 class="setup-step-title">How do you want to play?</h3>
      <p class="setup-step-copy">Start solo, or get a room ready for a group.</p>
      <div class="mode-toggle">
        <button class="toggle-pill ${state.mode === "single" ? "is-active" : ""}" data-action="set-mode" data-mode="single">Single player</button>
        <button class="toggle-pill ${state.mode === "multiplayer" ? "is-active" : ""}" data-action="set-mode" data-mode="multiplayer">Multiplayer</button>
      </div>
      <div class="setup-step-actions">
        ${backButton}
        <button class="btn" data-action="advance-setup">Continue</button>
      </div>
    `;
  }

  if (stepId === "multiplayerAction") {
    return `
      <div class="setup-step-meta">Step ${stepNumber} of ${totalSteps}</div>
      <h3 class="setup-step-title">Are you hosting or joining?</h3>
      <p class="setup-step-copy">Hosts create the topic and word pool. Guests just need the code and password.</p>
      <div class="submode-toggle">
        <button class="toggle-pill ${state.multiplayerAction === "create" ? "is-active" : ""}" data-action="set-multiplayer-action" data-multiplayer-action="create">Create room</button>
        <button class="toggle-pill ${state.multiplayerAction === "join" ? "is-active" : ""}" data-action="set-multiplayer-action" data-multiplayer-action="join">Join room</button>
      </div>
      <div class="setup-step-actions">
        ${backButton}
        <button class="btn" data-action="advance-setup">Continue</button>
      </div>
    `;
  }

  if (stepId === "topic") {
    return `
      <div class="setup-step-meta">Step ${stepNumber} of ${totalSteps}</div>
      <h3 class="setup-step-title">What is your topic?</h3>
      <p class="setup-step-copy">This is the first prompt the app takes, and it shapes the word bank for the board.</p>
      <div class="field">
        <label for="topic">Topic</label>
        <input id="topic" data-field="topic" value="${escapeHtml(state.setup.topic)}" placeholder="Funeral, baby shower, Product Support Days, carnival..." />
      </div>
      <div class="setup-step-actions">
        ${backButton}
        <button class="btn" data-action="advance-setup">Continue</button>
      </div>
    `;
  }

  if (stepId === "playerName") {
    const label = state.mode === "multiplayer" && state.multiplayerAction === "create"
      ? "Host name"
      : "Player name";

    return `
      <div class="setup-step-meta">Step ${stepNumber} of ${totalSteps}</div>
      <h3 class="setup-step-title">What should we call you?</h3>
      <p class="setup-step-copy">This can stay simple. If you leave it blank, the app will use a default player name.</p>
      <div class="field">
        <label for="playerName">${label}</label>
        <input id="playerName" data-field="playerName" value="${escapeHtml(state.setup.playerName)}" placeholder="Your name" />
      </div>
      <div class="setup-step-actions">
        ${backButton}
        <button class="btn" data-action="advance-setup">Continue</button>
      </div>
    `;
  }

  if (stepId === "roomName") {
    return `
      <div class="setup-step-meta">Step ${stepNumber} of ${totalSteps}</div>
      <h3 class="setup-step-title">What should the room be called?</h3>
      <p class="setup-step-copy">Give the room a clear name so it feels intentional when people join.</p>
      <div class="field">
        <label for="roomName">Room name</label>
        <input id="roomName" data-field="roomName" value="${escapeHtml(state.setup.roomName)}" placeholder="Team Offsite Bingo" />
      </div>
      <div class="setup-step-actions">
        ${backButton}
        <button class="btn" data-action="advance-setup">Continue</button>
      </div>
    `;
  }

  if (stepId === "roomCode") {
    return `
      <div class="setup-step-meta">Step ${stepNumber} of ${totalSteps}</div>
      <h3 class="setup-step-title">What room code did the host share?</h3>
      <p class="setup-step-copy">Enter the code first, then the password on the next screen.</p>
      <div class="field">
        <label for="joinRoomCode">Room code</label>
        <input id="joinRoomCode" data-field="roomCode" value="${escapeHtml(state.setup.roomCode)}" placeholder="AB12CD" />
      </div>
      <div class="setup-step-actions">
        ${backButton}
        <button class="btn" data-action="advance-setup">Continue</button>
      </div>
    `;
  }

  if (stepId === "roomPassword") {
    const copy = state.mode === "multiplayer" && state.multiplayerAction === "join"
      ? "Use the password the host gave you so the app can unlock the room."
      : "This adds a little security before you share the room code with other players.";

    return `
      <div class="setup-step-meta">Step ${stepNumber} of ${totalSteps}</div>
      <h3 class="setup-step-title">Set the room password</h3>
      <p class="setup-step-copy">${escapeHtml(copy)}</p>
      <div class="field">
        <label for="roomPassword">Password</label>
        <input id="roomPassword" type="password" data-field="roomPassword" value="${escapeHtml(state.setup.roomPassword)}" placeholder="At least 4 characters" />
      </div>
      <div class="setup-step-actions">
        ${backButton}
        <button class="btn" data-action="advance-setup">Continue</button>
      </div>
    `;
  }

  if (stepId === "generateWords") {
    return `
      <div class="setup-step-meta">Step ${stepNumber} of ${totalSteps}</div>
      <h3 class="setup-step-title">Want help building the word bank?</h3>
      <p class="setup-step-copy">The app will try the web first for <strong>${escapeHtml(state.setup.topic)}</strong>, and manual words stay available either way.</p>
      <div class="setup-mini-summary">
        <div class="metric">
          <strong>${generatedCount}</strong>
          <span>Generated words selected</span>
        </div>
        <div class="metric">
          <strong>${manualCount}</strong>
          <span>Manual words added</span>
        </div>
      </div>
      <div class="setup-step-actions">
        ${backButton}
        <button class="ghost-btn" data-action="skip-web-lookup">Skip web lookup</button>
        <button class="btn" data-action="advance-setup">${state.setup.isGenerating ? "Generating..." : state.setup.hasGenerated ? "Refresh suggestions" : "Generate words"}</button>
      </div>
    `;
  }

  if (stepId === "wordBank") {
    return `
      <div class="setup-step-meta">Step ${stepNumber} of ${totalSteps}</div>
      <h3 class="setup-step-title">Which words should go on the board?</h3>
      <p class="setup-step-copy">Keep the web suggestions you like, add your own, and build to 24 unique words before the free center square is added.</p>
      <div class="setup-mini-summary">
        <div class="metric">
          <strong>${wordPool.length}</strong>
          <span>Unique words ready</span>
        </div>
        <div class="metric">
          <strong>${generatedCount}</strong>
          <span>Web words selected</span>
        </div>
        <div class="metric">
          <strong>${manualCount}</strong>
          <span>Manual words added</span>
        </div>
      </div>
      <div class="section-card wizard-inner-card">
        <div class="section-head">
          <h3>Generated words</h3>
          <span class="small-text">${generatedCount} selected</span>
        </div>
        ${
          state.setup.generatedWords.length
            ? `
              <div class="word-chip-wrap">
                ${state.setup.generatedWords.map((word) => `
                  <button class="chip ${state.setup.selectedGeneratedWords.includes(word) ? "is-selected" : ""}" data-action="toggle-generated-word" data-word="${escapeHtml(word)}">${escapeHtml(word)}</button>
                `).join("")}
              </div>
            `
            : `<p class="empty-text">No generated words yet. That is okay. The manual inputs below can carry the full board if needed.</p>`
        }
        ${
          state.setup.sourceNotes.length
            ? `<p class="field-note">Sources used: ${escapeHtml(state.setup.sourceNotes.join(", "))}</p>`
            : ""
        }
      </div>
      <div class="section-card wizard-inner-card">
        <div class="section-head">
          <h3>Manual words</h3>
          <span class="small-text">Starts with 5 slots</span>
        </div>
        <div class="manual-list">
          ${state.setup.manualWords.map((word, index) => `
            <div class="manual-item">
              <input data-field="manualWord" data-index="${index}" value="${escapeHtml(word)}" placeholder="Custom word ${index + 1}" />
              <button type="button" data-action="remove-manual-word" data-index="${index}" aria-label="Remove custom word ${index + 1}" ${state.setup.manualWords.length > 5 ? "" : "disabled"}>${state.setup.manualWords.length > 5 ? "Remove" : "Keep"}</button>
            </div>
          `).join("")}
        </div>
        <div class="button-row">
          <button class="ghost-btn" data-action="add-manual-word">Add another word</button>
        </div>
        <p class="field-note">
          ${needsWords > 0
            ? `You need ${needsWords} more unique words before the board can be built.`
            : "You have enough words to build the board right now."}
        </p>
      </div>
      <div class="setup-step-actions">
        ${backButton}
        <button class="btn" data-action="advance-setup">Continue</button>
      </div>
    `;
  }

  if (stepId === "readyJoin") {
    return `
      <div class="setup-step-meta">Step ${stepNumber} of ${totalSteps}</div>
      <h3 class="setup-step-title">Ready to join the room?</h3>
      <p class="setup-step-copy">Once you continue, the app will pull your board and make it the main focus of the screen.</p>
      <div class="setup-review-grid">
        <div class="metric">
          <strong>${escapeHtml(state.setup.roomCode || "Pending")}</strong>
          <span>Room code</span>
        </div>
        <div class="metric">
          <strong>${escapeHtml(state.setup.playerName || "Guest")}</strong>
          <span>Player name</span>
        </div>
      </div>
      <div class="setup-step-actions">
        ${backButton}
        <button class="btn" data-action="advance-setup">Join room</button>
      </div>
    `;
  }

  return `
    <div class="setup-step-meta">Step ${stepNumber} of ${totalSteps}</div>
    <h3 class="setup-step-title">Ready to build the board?</h3>
    <p class="setup-step-copy">The setup is done. Next up is a short loading moment while the board is generated and brought front and center.</p>
    <div class="setup-review-grid">
      <div class="metric">
        <strong>${escapeHtml(state.setup.topic || "Pending")}</strong>
        <span>Topic</span>
      </div>
      <div class="metric">
        <strong>${escapeHtml(state.mode === "multiplayer" ? (state.setup.roomName || `${state.setup.topic || "Topic"} Bingo`) : "Single player")}</strong>
        <span>${state.mode === "multiplayer" ? "Room name" : "Mode"}</span>
      </div>
      <div class="metric">
        <strong>${wordPool.length}</strong>
        <span>Words ready</span>
      </div>
    </div>
    <div class="setup-step-actions">
      ${backButton}
      <button class="btn" data-action="advance-setup">${state.mode === "single" ? "Generate board" : "Create room"}</button>
    </div>
  `;
}

function renderSetupProgress({ complete }) {
  const percent = complete ? 100 : getSetupProgressPercent();
  return `
    <div class="setup-progress ${complete ? "is-complete" : ""}">
      <div class="setup-progress-track">
        <div class="setup-progress-fill" style="width:${percent}%"></div>
      </div>
      <span class="setup-progress-label">${percent}%</span>
    </div>
  `;
}

function renderLoadingScreen() {
  return `
    <main class="setup-wizard">
      <section class="hero-card wizard-shell wizard-shell-loading">
        <div class="loading-spinner" aria-hidden="true"></div>
        <div class="loading-copy">
          <span class="eyebrow">Loading board</span>
          <h2 class="hero-title wizard-hero-title">${escapeHtml(state.loading.title)}</h2>
          <p class="setup-step-copy">${escapeHtml(state.loading.message)}</p>
        </div>
      </section>
      ${renderSetupProgress({ complete: true })}
    </main>
  `;
}

function renderPlayScreen() {
  const playerCount = state.play.players.length || 1;
  const markedCount = state.play.marks.filter(Boolean).length;
  const winningIndexes = new Set(state.play.winningIndexes);
  return `
    <main class="play-layout">
      <section class="play-card">
        <div class="play-head">
          <div>
            <span class="eyebrow">${state.play.isMultiplayer ? "Multiplayer room" : "Single player"}</span>
            <h2 style="margin-top:0.9rem;">${escapeHtml(state.play.roomName || `${state.play.topic} Bingo`)}</h2>
            <p class="play-topic">Topic: ${escapeHtml(state.play.topic)}${state.play.roomCode ? ` · Room code: ${escapeHtml(state.play.roomCode)}` : ""}</p>
          </div>
          <div class="status-banner ${state.play.claimedBingo ? "is-success" : ""}">
            <div class="status-kicker">${state.play.claimedBingo ? "B" : markedCount}</div>
            <div>
              <strong>${state.play.claimedBingo ? "Bingo locked in" : "Keep marking your board"}</strong>
              <p class="status-text">
                ${
                  state.play.claimedBingo
                    ? "You have a winning line on the board."
                    : "Tap squares as they happen. The free center square is already marked."
                }
              </p>
            </div>
          </div>
        </div>

        <div class="bingo-label-row">
          <div class="bingo-label">B</div>
          <div class="bingo-label">I</div>
          <div class="bingo-label">N</div>
          <div class="bingo-label">G</div>
          <div class="bingo-label">O</div>
        </div>
        <div class="bingo-board">
          ${state.play.board.map((cell, index) => `
            <button
              class="bingo-cell ${state.play.marks[index] ? "is-marked" : ""} ${cell.free ? "is-free" : ""} ${winningIndexes.has(index) ? "is-winning" : ""}"
              data-action="toggle-board-cell"
              data-index="${index}"
              ${cell.free ? "disabled" : ""}
            >
              <strong>${escapeHtml(cell.label)}</strong>
            </button>
          `).join("")}
        </div>
      </section>

      <aside class="side-stack">
        <section class="side-card">
          <h2>Game details</h2>
          <div class="metric-row" style="margin-top:1rem;">
            <div class="metric">
              <strong>${markedCount}</strong>
              <span>Squares marked</span>
            </div>
            <div class="metric">
              <strong>${state.play.wordPoolSize}</strong>
              <span>Words in pool</span>
            </div>
            <div class="metric">
              <strong>${playerCount}</strong>
              <span>${state.play.isMultiplayer ? "Players in room" : "Player"}</span>
            </div>
          </div>
          <div class="button-row">
            <button class="btn" data-action="claim-bingo">Call bingo</button>
            ${
              state.play.isMultiplayer
                ? `<button class="ghost-btn" data-action="sync-room">Sync now</button>`
                : `<button class="ghost-btn" data-action="new-game">Build another board</button>`
            }
          </div>
          <p class="field-note" style="margin-top:0.8rem;">
            ${
              state.play.isMultiplayer
                ? `Last synced ${escapeHtml(relativeTime(state.play.updatedAt))}.`
                : "Single-player boards update instantly on your device."
            }
          </p>
        </section>

        ${
          state.play.isMultiplayer
            ? `
              <section class="side-card">
                <h2>Room players</h2>
                <div class="player-list">
                  ${state.play.players.map((player) => `
                    <article class="player-card">
                      <div class="player-line">
                        <span class="player-name">${escapeHtml(player.name)}</span>
                        <span class="player-meta">${player.markedCount} marks</span>
                      </div>
                      <p class="player-meta">Joined ${escapeHtml(relativeTime(player.joinedAt))}</p>
                      <p class="player-status ${player.claimedBingo ? "is-success" : ""}">
                        ${
                          player.claimedBingo
                            ? "Called bingo"
                            : player.hasBingo
                              ? "Has a winning line ready"
                              : `Active ${escapeHtml(relativeTime(player.lastSeenAt))}`
                        }
                      </p>
                    </article>
                  `).join("")}
                </div>
              </section>
            `
            : `
              <section class="side-card">
                <h2>How to customize</h2>
                <p class="small-text">Use the settings button in the top bar whenever you want to switch themes or upload your own background image.</p>
              </section>
            `
        }
      </aside>
    </main>
  `;
}

function renderSettingsDrawer() {
  return `
    <div class="drawer-backdrop" data-action="close-settings"></div>
    <aside class="settings-drawer">
      <div class="drawer-head">
        <div>
          <h2 style="margin:0;font-family:'Sora',sans-serif;">App settings</h2>
          <p class="small-text">Keep the board front-and-center while global style changes live here.</p>
        </div>
        <button class="icon-btn" data-action="close-settings">Close</button>
      </div>

      <section class="section-card">
        <div class="section-head">
          <h3>Theme preset</h3>
        </div>
        <div class="theme-picker">
          ${Object.entries(themes).map(([key, theme]) => `
            <button class="theme-swatch ${state.preferences.theme === key ? "is-active" : ""}" data-action="set-theme" data-theme="${key}">
              <span class="swatch-bar">
                ${theme.swatch.map((color) => `<span style="background:${color};"></span>`).join("")}
              </span>
              <span class="theme-label">${escapeHtml(theme.name)}</span>
            </button>
          `).join("")}
        </div>
      </section>

      <section class="section-card">
        <div class="section-head">
          <h3>Background image</h3>
        </div>
        <div class="upload-box">
          <p class="small-text">Upload your own photo to set the mood for the whole app. It stays local to this browser.</p>
          <input type="file" accept="image/*" data-field="backgroundUpload" />
          <div class="button-row">
            <button class="ghost-btn" data-action="clear-background">Use app background instead</button>
          </div>
        </div>
      </section>
    </aside>
  `;
}

function sampleBoard() {
  return [
    "Guestbook",
    "Cake time",
    "Inside joke",
    "Photo op",
    "Confetti",
    "Cheers",
    "Late arrival",
    "Theme outfit",
    "Dance break",
    "Big laugh",
    "Speech moment",
    "Surprise guest",
    "FREE SPACE",
    "Snack table",
    "Group selfie",
    "Happy tears",
    "Gift bag",
    "Crowd favorite",
    "Song request",
    "Mini chaos",
    "Host shout-out",
    "Signature phrase",
    "Round of applause",
    "Unexpected twist",
    "Final toast"
  ];
}
