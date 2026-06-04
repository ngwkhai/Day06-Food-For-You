import OpenAI from "openai";
import { toFile } from "openai/uploads";

type JsonCompletionOptions = {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
};

type TextCompletionOptions = JsonCompletionOptions;

type AudioTranscriptionOptions = {
  audioBuffer: Buffer;
  mimeType: string;
  filename?: string;
};

export type LlmClient = {
  isConfigured(): boolean;
  createJsonCompletion(options: JsonCompletionOptions): Promise<unknown>;
  createTextCompletion(options: TextCompletionOptions): Promise<string>;
};

function getTimeoutMs(): number {
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? 10000);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000;
}

export class OpenAIService implements LlmClient {
  private client?: OpenAI;

  private getModel(): string {
    return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  }

  private getTranscriptionModel(): string {
    return process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1";
  }

  private getClient(): OpenAI | undefined {
    if (this.client) {
      return this.client;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === "your_openai_key_here") {
      return undefined;
    }

    this.client = new OpenAI({
      apiKey,
      timeout: getTimeoutMs(),
    });

    return this.client;
  }

  isConfigured(): boolean {
    return this.getClient() !== undefined;
  }

  async createJsonCompletion(options: JsonCompletionOptions): Promise<unknown> {
    const content = await this.createChatCompletion({
      ...options,
      responseFormat: { type: "json_object" },
    });

    try {
      return JSON.parse(content);
    } catch {
      throw new Error("OpenAI returned invalid JSON");
    }
  }

  async createTextCompletion(options: TextCompletionOptions): Promise<string> {
    return this.createChatCompletion(options);
  }

  async transcribeAudio(options: AudioTranscriptionOptions): Promise<string> {
    const client = this.getClient();
    if (!client) {
      throw new Error("OpenAI client is not configured");
    }

    const file = await toFile(
      options.audioBuffer,
      options.filename ?? "voice-message.webm",
      {
        type: options.mimeType,
      },
    );
    const transcript = await client.audio.transcriptions.create({
      file,
      model: this.getTranscriptionModel(),
      language: "vi",
      response_format: "json",
    });

    return transcript.text.trim();
  }

  private async createChatCompletion(
    options: JsonCompletionOptions & {
      responseFormat?: { type: "json_object" };
    },
  ): Promise<string> {
    const client = this.getClient();
    if (!client) {
      throw new Error("OpenAI client is not configured");
    }

    const completion = await client.chat.completions.create({
      model: this.getModel(),
      temperature: options.temperature ?? 0.2,
      response_format: options.responseFormat,
      messages: [
        {
          role: "system",
          content: options.systemPrompt,
        },
        {
          role: "user",
          content: options.userPrompt,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned an empty response");
    }

    return content;
  }
}

export const openAIService = new OpenAIService();
