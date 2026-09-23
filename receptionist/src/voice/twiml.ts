import { openingLine } from "../dialogue/machine";

export function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export interface RelayTwimlInput {
  websocketUrl: string;
  voice: string;
  ttsProvider: string;
}

export function conversationRelayTwiml(input: RelayTwimlInput): string {
  const greeting = xmlEscape(openingLine());
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay url="${xmlEscape(input.websocketUrl)}" welcomeGreeting="${greeting}" ttsProvider="${xmlEscape(input.ttsProvider)}" voice="${xmlEscape(input.voice)}" language="en-US" transcriptionProvider="Deepgram" interruptible="true" dtmfDetection="false"/>
  </Connect>
</Response>`;
}

export interface GatherTwimlInput {
  actionUrl: string;
  sayVoice: string;
  prompt: string;
  done: boolean;
}

export function gatherTwiml(input: GatherTwimlInput): string {
  const prompt = xmlEscape(input.prompt);
  const voice = xmlEscape(input.sayVoice);
  if (input.done) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}">${prompt}</Say>
  <Hangup/>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${xmlEscape(input.actionUrl)}" method="POST" speechTimeout="auto" language="en-US">
    <Say voice="${voice}">${prompt}</Say>
  </Gather>
  <Say voice="${voice}">I didn't hear anything. Please call back when you are ready.</Say>
  <Hangup/>
</Response>`;
}
