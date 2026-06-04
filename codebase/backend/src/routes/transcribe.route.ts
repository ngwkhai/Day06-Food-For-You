import express, { Router } from "express";

import { openAIService } from "../services/openai.service.js";
import type { TranscribeResponse } from "../types/api.js";

const SUPPORTED_AUDIO_TYPES = [
  "audio/webm",
  "audio/wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "video/webm",
  "application/octet-stream",
];

export const transcribeRouter = Router();

const audioBodyParser = express.raw({
  type: SUPPORTED_AUDIO_TYPES,
  limit: "25mb",
});

function getAudioMimeType(contentType: string | undefined): string {
  return contentType?.split(";")[0]?.trim() || "audio/webm";
}

function getAudioExtension(mimeType: string): string {
  if (mimeType.includes("wav")) {
    return "wav";
  }

  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) {
    return "mp3";
  }

  if (mimeType.includes("mp4") || mimeType.includes("m4a")) {
    return "m4a";
  }

  return "webm";
}

transcribeRouter.post("/", audioBodyParser, async (req, res) => {
  try {
    const audioBuffer = req.body;

    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
      const response: TranscribeResponse = {
        status: "error",
        text: "",
        message: "No audio payload received",
      };

      res.status(400).json(response);
      return;
    }

    if (!openAIService.isConfigured()) {
      const response: TranscribeResponse = {
        status: "error",
        text: "",
        message: "OPENAI_API_KEY is not configured",
      };

      res.status(503).json(response);
      return;
    }

    const mimeType = getAudioMimeType(req.header("content-type"));
    const text = await openAIService.transcribeAudio({
      audioBuffer,
      mimeType,
      filename: `voice-message.${getAudioExtension(mimeType)}`,
    });
    const response: TranscribeResponse = {
      status: "ok",
      text,
    };

    res.json(response);
  } catch (error) {
    console.error("Failed to handle /api/transcribe", error);

    const response: TranscribeResponse = {
      status: "error",
      text: "",
      message: "Failed to transcribe audio",
    };

    res.status(500).json(response);
  }
});
