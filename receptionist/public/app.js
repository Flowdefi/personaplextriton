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
let recognition = null;

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

function pickFemaleVoice() {
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  return (
    voices.find((voice) => /female|samantha|joanna|karen|moira|fiona|victoria|zira/i.test(voice.name)) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ??
    null
  );
}

function speak(text) {
  if (!window.speechSynthesis) {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickFemaleVoice();
  if (voice) {
    utterance.voice = voice;
  }
  utterance.lang = "en-US";
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

async function loadStatus() {
  const response = await fetch("/status");
  const payload = await response.json();
  statusSummary.textContent = payload.model?.note ?? "Scripted receptionist.";
  statusList.replaceChildren();
  const rows = [
    ["Model", payload.model?.provider ?? "scripted"],
    ["Voice", `${payload.voice?.ttsProvider ?? ""} ${payload.voice?.voice ?? ""}`.trim()],
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
    missing.length > 0 ? `Not set (values are hidden): ${missing.join(", ")}` : "Required keys are set.";
  statusList.append(missingItem);
}

async function startCall() {
  const response = await fetch("/dialogue/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callerPhone: "browser-test" }),
  });
  const payload = await response.json();
  if (!response.ok) {
    addBubble("agent", payload.error ?? "The receptionist could not start.");
    return;
  }
  sessionId = payload.sessionId;
  addBubble("agent", payload.say);
  speak(payload.say);
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
  speak(payload.say);
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
  window.speechSynthesis?.cancel();
  recognition?.stop();
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
  micButton.disabled = true;
  micNote.textContent = "This browser has no speech recognition. Type your replies instead.";
} else {
  micNote.textContent = "Speak uses this browser's voice. A female voice is chosen when one is installed.";
  micButton.addEventListener("click", () => {
    if (recognition) {
      recognition.stop();
      return;
    }
    const next = new SpeechRecognition();
    recognition = next;
    next.lang = "en-US";
    next.interimResults = false;
    next.onresult = (event) => {
      const said = event.results?.[0]?.[0]?.transcript ?? "";
      if (said.trim()) {
        void sendText(said.trim());
      }
    };
    next.onend = () => {
      recognition = null;
      micButton.textContent = "Speak";
    };
    next.onerror = () => {
      micNote.textContent = "The microphone did not capture that. You can type instead.";
    };
    micButton.textContent = "Listening…";
    next.start();
  });
}

if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    const voice = pickFemaleVoice();
    if (!voice) {
      micNote.textContent = `${micNote.textContent} No female system voice was found, so the browser default will be used.`;
    }
  };
}

await loadStatus();
await startCall();
