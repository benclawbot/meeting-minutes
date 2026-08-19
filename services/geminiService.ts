import { FFmpeg, FFFSType, type FSNode } from "@ffmpeg/ffmpeg";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import { AnalysisResult } from "../types";

const TARGET_RATE = 16000;
const CHUNK_DURATION_SEC = 90;
let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

const getFFmpeg = async (): Promise<FFmpeg> => {
  if (ffmpegInstance?.loaded) return ffmpegInstance;
  if (!ffmpegLoadPromise) {
    ffmpegInstance = new FFmpeg();
    ffmpegLoadPromise = ffmpegInstance.load({ coreURL, wasmURL }).then(() => ffmpegInstance as FFmpeg);
  }
  return ffmpegLoadPromise;
};

const readTextFile = async (ffmpeg: FFmpeg, path: string): Promise<string> => {
  const data = await ffmpeg.readFile(path, "utf8");
  return typeof data === "string" ? data : new TextDecoder().decode(data);
};

const cleanupDir = async (ffmpeg: FFmpeg, dir: string) => {
  try {
    const entries = await ffmpeg.listDir(dir);
    await Promise.all(entries.filter(entry => entry.name !== "." && entry.name !== ".." && !entry.isDir).map(entry => ffmpeg.deleteFile(`${dir}/${entry.name}`).catch(() => false)));
    await ffmpeg.deleteDir(dir);
  } catch { /* best effort */ }
};

const prepareAudioChunks = async (mediaFile: File): Promise<{ chunks: FSNode[]; outputDir: string; audioSeconds: number; ffmpeg: FFmpeg }> => {
  const ffmpeg = await getFFmpeg();
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inputDir = `/input-${runId}`;
  const outputDir = `/output-${runId}`;
  const inputPath = `${inputDir}/recording`;
  const durationPath = `${outputDir}/duration.txt`;
  await ffmpeg.createDir(inputDir); await ffmpeg.createDir(outputDir);
  await ffmpeg.mount(FFFSType.WORKERFS, { blobs: [{ name: "recording", data: mediaFile }] }, inputDir);
  try {
    await ffmpeg.ffprobe(["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", inputPath, "-o", durationPath]);
    const durationText = await readTextFile(ffmpeg, durationPath).catch(() => "0");
    const audioSeconds = Number.parseFloat(durationText) || 0;
    await ffmpeg.deleteFile(durationPath).catch(() => false);
    const exitCode = await ffmpeg.exec(["-i", inputPath, "-vn", "-map", "0:a:0", "-ac", "1", "-ar", String(TARGET_RATE), "-c:a", "pcm_s16le", "-f", "segment", "-segment_time", String(CHUNK_DURATION_SEC), "-reset_timestamps", "1", `${outputDir}/chunk_%03d.wav`]);
    if (exitCode !== 0) throw new Error(`FFmpeg returned exit code ${exitCode}.`);
    const chunks = (await ffmpeg.listDir(outputDir)).filter(entry => !entry.isDir && entry.name.endsWith(".wav")).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!chunks.length) throw new Error("No audio chunks could be generated.");
    return { chunks, outputDir, audioSeconds, ffmpeg };
  } catch (err) { await cleanupDir(ffmpeg, outputDir); throw err; }
  finally { await ffmpeg.unmount(inputDir).catch(() => false); await ffmpeg.deleteDir(inputDir).catch(() => false); }
};

export const analyzeMeetingVideo = async (mediaFile: File, title: string, date: string, locale: "fr" | "en" = "fr", onStatusChange?: (status: string) => void): Promise<AnalysisResult> => {
  onStatusChange?.("EXTRACTING_AUDIO");
  const { chunks, outputDir, audioSeconds, ffmpeg } = await prepareAudioChunks(mediaFile);
  onStatusChange?.("UPLOADING");
  const transcriptionParts: string[] = [];
  let totalCharCount = 0;
  try {
    for (const chunk of chunks) {
      onStatusChange?.("TRANSCRIBING");
      const chunkPath = `${outputDir}/${chunk.name}`;
      const chunkData = await ffmpeg.readFile(chunkPath);
      const wavBlob = new Blob([chunkData], { type: "audio/wav" });
      await ffmpeg.deleteFile(chunkPath).catch(() => false);
      const res = await fetch("/api/transcribe", { method: "POST", body: wavBlob });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string }; throw new Error(err.error || "Erreur de transcription"); }
      const data = await res.json() as { text?: string };
      if (data.text?.trim()) { transcriptionParts.push(data.text.trim()); totalCharCount += data.text.trim().length; }
    }
  } finally { await cleanupDir(ffmpeg, outputDir); }

  const transcript = transcriptionParts.join(" ");
  if (!transcript.trim()) throw new Error("Aucun contenu audio detecte dans le fichier.");
  onStatusChange?.("PROCESSING");
  const res = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, date, transcript, locale }) });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string }; throw new Error(err.error || "Erreur de generation"); }
  const data = await res.json() as { minutes?: string; usage?: { input_tokens?: number; output_tokens?: number } };
  if (!data.minutes?.trim()) throw new Error("Aucun contenu genere.");
  return { minutes: data.minutes, usage: { audioSeconds, charCount: totalCharCount, segmentCount: chunks.length, inputTokens: data.usage?.input_tokens || 0, outputTokens: data.usage?.output_tokens || 0 } };
};
