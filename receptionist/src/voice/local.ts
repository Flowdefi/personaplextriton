import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AppConfig } from "../config.ts";

const MAX_AUDIO_BYTES = 8_000_000;

export function espeakArgs(config: AppConfig, wavPath: string): string[] {
  return ["-v", config.espeakVoice, "-s", "150", "-w", wavPath, "--stdin"];
}

export function piperArgs(config: AppConfig, wavPath: string): string[] {
  return ["--model", config.piperModel ?? "", "--output_file", wavPath];
}

export async function synthesize(config: AppConfig, text: string): Promise<Uint8Array> {
  const clipped = text.replace(/\s+/g, " ").trim().slice(0, 2000);
  if (!clipped) {
    throw new Error("Nothing to speak");
  }
  const dir = await mkdtemp(path.join(tmpdir(), "triton-say-"));
  const wavPath = path.join(dir, "say.wav");
  try {
    if (config.piperBin && config.piperModel) {
      await run(config.piperBin, piperArgs(config, wavPath), clipped);
    } else {
      await run(config.espeakBin, espeakArgs(config, wavPath), clipped);
    }
    return await readFile(wavPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function transcribe(config: AppConfig, audio: Uint8Array, contentType: string): Promise<string> {
  if (audio.byteLength === 0 || audio.byteLength > MAX_AUDIO_BYTES) {
    throw new Error("Audio is empty or too large");
  }
  const dir = await mkdtemp(path.join(tmpdir(), "triton-hear-"));
  const extension = contentType.includes("wav") ? "wav" : "webm";
  const inputPath = path.join(dir, `in.${extension}`);
  const wavPath = path.join(dir, "in.wav");
  try {
    await writeFile(inputPath, audio);
    await run(config.ffmpegBin, ["-y", "-i", inputPath, "-ar", "16000", "-ac", "1", wavPath], "");
    const text = await run(config.sttCommand.split(" ")[0] ?? "python3", commandArgs(config.sttCommand, wavPath), "");
    return text.trim();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function commandArgs(command: string, wavPath: string): string[] {
  const parts = command.split(" ").filter((part) => part.length > 0);
  return [...parts.slice(1), wavPath];
}

function run(bin: string, args: string[], stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"], cwd: process.cwd() });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `${bin} exited ${code ?? "unknown"}`));
        return;
      }
      resolve(stdout);
    });
    if (stdin) {
      child.stdin.end(stdin);
    } else {
      child.stdin.end();
    }
  });
}
