/**
 * Azure AI API helper library
 * Provides low-level interactions with Azure AI services
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import OpenAI from "openai";

interface UsageData {
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface LogEntry {
  timestamp: string;
  script: string;
  model: string;
  usage: UsageData;
  question_length: number;
  response_length: number;
  question_preview: string;
  response_preview: string;
}

export class AzureAIClient {
  private apiKey: string;
  private baseUrl: string;
  private apiVersion: string;
  private deployment: string;
  private logFile: string;
  private client: OpenAI;

  constructor() {
    this.apiKey = process.env.AZUREAI_API_KEY || "";
    this.baseUrl = process.env.AZUREAI_BASE_URL || "";
    this.apiVersion = process.env.AZUREAI_API_VERSION || "";
    this.deployment = process.env.AZUREAI_DEPLOYMENT || "";

    // Setup logging
    const envLogFile = process.env.AZUREAI_LOGFILE;
    this.logFile = envLogFile
      ? path.resolve(os.homedir(), envLogFile.replace(/^~/, ""))
      : path.join(os.homedir(), ".azure_ai_usage.log");

    if (!this.apiKey || !this.baseUrl || !this.apiVersion || !this.deployment) {
      throw new Error(
        "Missing required environment variables: AZUREAI_API_KEY, AZUREAI_BASE_URL, AZUREAI_API_VERSION, AZUREAI_DEPLOYMENT",
      );
    }

    // Initialize Azure OpenAI client using openai package
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: `${this.baseUrl.replace(/\/$/, "")}/openai/deployments`,
      defaultQuery: { "api-version": this.apiVersion },
      defaultHeaders: { "api-key": this.apiKey },
    });
  }

  private logUsage(
    model: string,
    usageData: UsageData,
    question: string = "",
    responseText: string = "",
  ): void {
    try {
      const logEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        script: path.basename(process.argv[1] || "unknown"),
        model,
        usage: usageData,
        question_length: question.length,
        response_length: responseText.length,
        question_preview:
          question.length > 100 ? question.substring(0, 100) + "..." : question,
        response_preview:
          responseText.length > 100
            ? responseText.substring(0, 100) + "..."
            : responseText,
      };

      fs.appendFileSync(this.logFile, JSON.stringify(logEntry) + "\n", "utf-8");
    } catch (error: any) {
      console.error(`⚠️  Erreur lors de l'écriture du log: ${error.message}`);
    }
  }

  async askQuestion(
    question: string,
    model: string = "gpt-3.5-turbo",
    maxTokens: number = 1000,
    temperature: number = 0.7,
  ): Promise<string | null> {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.deployment,
        messages: [
          {
            role: "user",
            content: question,
          },
        ],
        max_tokens: maxTokens,
        temperature,
      });

      const responseText = completion.choices[0]?.message?.content?.trim();

      if (!responseText) {
        console.error("Erreur de parsing de la réponse");
        return null;
      }

      // Log usage data
      const usageData = {
        total_tokens: completion.usage?.total_tokens,
        prompt_tokens: completion.usage?.prompt_tokens,
        completion_tokens: completion.usage?.completion_tokens,
      };
      this.logUsage(model, usageData, question, responseText);

      return responseText;
    } catch (error: any) {
      if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
        console.error(`Erreur de connexion: ${error.message}`);
      } else if (error.status) {
        console.error(`Erreur API: ${error.status}`);
        console.error(`Réponse: ${error.message}`);
      } else {
        console.error(`Erreur: ${error.message}`);
      }
      return null;
    }
  }
}
