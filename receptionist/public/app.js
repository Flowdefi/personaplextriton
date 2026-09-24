const log = document.querySelector("#log");
const form = document.querySelector("#composer");
const utterance = document.querySelector("#utterance");
const statusSummary = document.querySelector("#status-summary");
const statusList = document.querySelector("#status-list");
const result = document.querySelector("#result");
const micButton = document.querySelector("#mic");
const micNote = document.querySelector("#mic-note");
const stopSpeech = document.querySelector("#stop-speech");

let sessionId = "";
let busy = false;
let finished = false;
let recorder = null;
let chunks = [];
let currentAudio = null;

function addBubble(role, text) {
  const item = document.createElement("article");
  item.className = `bubble ${role}`;
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = role === "agent" ? "Triton AI" : "You";
  const body = document.createElement("p");
  body.textContent = text;
  item.append(who, body);
  log.append(item);
  log.scrollTop = log.scrollHeight;
}

async function speak(session) {
  stopAudio();
  const response = await fetch("/voice/speak", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: session }),
  });
  if (!response.ok) {
    micNote.textContent = "Speech engine is not available yet. The text reply is still on screen.";
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudio = audio;
  audio.onended = () => URL.revokeObjectURL(url);
  await audio.play();
}

function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

async function loadStatus() {
  const response = await fetch("/status");
  const payload = await response.json();
  statusSummary.textContent = payload.model?.note ?? "Scripted receptionist.";
  statusList.replaceChildren();
  const rows = [
    ["Model", payload.model?.provider ?? "scripted"],
    ["Voice", `${payload.voice?.engine ?? ""} ${payload.voice?.voice ?? ""}`.trim()],
    ["Lead email", payload.leadEmailTo ?? ""],
    ["Business line", payload.businessPhone ?? ""],
  ];
  for (const [label, value] of rows) {
    const item = document.createElement("li");
    item.textContent = `${label}: ${value}`;
    statusList.append(item);
  }
  const missing = Array.isArray(payload.missing) ? payload.missing : [];
  const missingItem = document.createElement("li");
  missingItem.textContent =
    missing.length > 0 ? `Email needs: ${missing.join(", ")}` : "SMTP is configured.";
  statusList.append(missingItem);
}

async function startCall() {
  const response = await fetch("/dialogue/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callerPhone: "browser-test", source: "browser" }),
  });
  const payload = await response.json();
  if (!response.ok) {
    addBubble("agent", payload.error ?? "The receptionist could not start.");
    return;
  }
  sessionId = payload.sessionId;
  addBubble("agent", payload.say);
  await speak(sessionId);
}

async function submitLead(lead) {
  const response = await fetch("/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...lead, sessionId }),
  });
  const payload = await response.json();
  result.hidden = false;
  const status = payload.emailStatus ?? "unknown";
  const detail = payload.emailDetail ?? payload.error ?? "No email detail was returned.";
  result.textContent = `Lead ${payload.stored ? "stored" : "not stored"}. Email status: ${status}. ${detail}`;
  result.className = `result ${status === "sent" ? "good" : "warn"}`;
}

async function sendText(text) {
  if (!sessionId || busy || finished) {
    return;
  }
  busy = true;
  addBubble("caller", text);
  const response = await fetch("/dialogue/turn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, text }),
  });
  const payload = await response.json();
  busy = false;
  if (!response.ok) {
    addBubble("agent", payload.error ?? "Something went wrong.");
    return;
  }
  addBubble("agent", payload.say);
  await speak(sessionId);
  if (payload.done && payload.lead) {
    finished = true;
    utterance.disabled = true;
    await submitLead(payload.lead);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = utterance.value.trim();
  if (!text) {
    return;
  }
  utterance.value = "";
  void sendText(text);
});

stopSpeech.addEventListener("click", () => {
  stopAudio();
  if (recorder && recorder.state === "recording") {
    recorder.stop();
  }
});

if (!navigator.mediaDevices?.getUserMedia) {
  micButton.disabled = true;
  micNote.textContent = "This browser cannot use the microphone. Type your replies. Speech playback still uses espeak-ng or Piper.";
} else {
  micNote.textContent = "Speak records audio and transcribes it on the server with Vosk. Playback uses espeak-ng or Piper.";
  micButton.addEventListener("click", async () => {
    if (recorder && recorder.state === "recording") {
      recorder.stop();
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      micButton.textContent = "Speak";
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      const response = await fetch("/voice/utterance", {
        method: "POST",
        headers: {
          "content-type": blob.type || "audio/webm",
          "x-session-id": sessionId,
        },
        body: blob,
      });
      const payload = await response.json();
      if (!response.ok) {
        micNote.textContent = payload.error ?? "Transcription failed. You can type instead.";
        return;
      }
      addBubble("caller", payload.text);
      addBubble("agent", payload.say);
      await speak(sessionId);
      if (payload.done && payload.lead) {
        finished = true;
        utterance.disabled = true;
        await submitLead(payload.lead);
      }
    };
    micButton.textContent = "Listening…";
    recorder.start();
  });
}

await loadStatus();
await startCall();
