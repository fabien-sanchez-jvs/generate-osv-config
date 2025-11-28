/**
 * Unit tests for Azure AI API helper library
 */

import * as fs from 'fs';
import { AzureAIClient } from '../azureAi';
import OpenAI from 'openai';

jest.mock('fs');
jest.mock('openai');

describe('AzureAIClient', () => {
  const originalEnv = process.env;
  let mockOpenAI: jest.Mocked<OpenAI>;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      AZUREAI_API_KEY: 'test-api-key',
      AZUREAI_BASE_URL: 'https://test.openai.azure.com/',
      AZUREAI_API_VERSION: '2023-05-15',
      AZUREAI_DEPLOYMENT: 'test-deployment',
    };

    mockCreate = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: '  Test response  ',
          },
        },
      ],
      usage: {
        total_tokens: 100,
        prompt_tokens: 50,
        completion_tokens: 50,
      },
    });

    mockOpenAI = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    } as any;

    (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => mockOpenAI);
    (fs.appendFileSync as jest.Mock).mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should initialize with environment variables', () => {
      const client = new AzureAIClient();
      expect(client).toBeDefined();
      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        baseURL: 'https://test.openai.azure.com/openai/deployments',
        defaultQuery: { 'api-version': '2023-05-15' },
        defaultHeaders: { 'api-key': 'test-api-key' },
      });
    });

    it('should throw error if API key is missing', () => {
      delete process.env.AZUREAI_API_KEY;
      expect(() => new AzureAIClient()).toThrow(
        'Missing required environment variables: AZUREAI_API_KEY, AZUREAI_BASE_URL, AZUREAI_API_VERSION, AZUREAI_DEPLOYMENT'
      );
    });

    it('should throw error if base URL is missing', () => {
      delete process.env.AZUREAI_BASE_URL;
      expect(() => new AzureAIClient()).toThrow(
        'Missing required environment variables: AZUREAI_API_KEY, AZUREAI_BASE_URL, AZUREAI_API_VERSION, AZUREAI_DEPLOYMENT'
      );
    });

    it('should throw error if API version is missing', () => {
      delete process.env.AZUREAI_API_VERSION;
      expect(() => new AzureAIClient()).toThrow(
        'Missing required environment variables: AZUREAI_API_KEY, AZUREAI_BASE_URL, AZUREAI_API_VERSION, AZUREAI_DEPLOYMENT'
      );
    });

    it('should throw error if deployment is missing', () => {
      delete process.env.AZUREAI_DEPLOYMENT;
      expect(() => new AzureAIClient()).toThrow(
        'Missing required environment variables: AZUREAI_API_KEY, AZUREAI_BASE_URL, AZUREAI_API_VERSION, AZUREAI_DEPLOYMENT'
      );
    });

    it('should use custom log file from environment', () => {
      process.env.AZUREAI_LOGFILE = '~/custom-log.log';
      const client = new AzureAIClient();
      expect(client).toBeDefined();
    });

    it('should use default log file if not specified', () => {
      delete process.env.AZUREAI_LOGFILE;
      const client = new AzureAIClient();
      expect(client).toBeDefined();
    });

    it('should remove trailing slash from base URL', () => {
      process.env.AZUREAI_BASE_URL = 'https://test.openai.azure.com/';
      new AzureAIClient();
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://test.openai.azure.com/openai/deployments',
        })
      );
    });
  });

  describe('askQuestion', () => {

    it('should ask a question with default parameters', async () => {
      const client = new AzureAIClient();
      const response = await client.askQuestion('What is AI?');

      expect(response).toBe('Test response');
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'test-deployment',
        messages: [
          {
            role: 'user',
            content: 'What is AI?',
          },
        ],
        max_tokens: 1000,
        temperature: 0.7,
      });
    });

    it('should ask a question with custom parameters', async () => {
      const client = new AzureAIClient();
      await client.askQuestion('Test question', 'gpt-4', 2000, 0.5);

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'test-deployment',
        messages: [
          {
            role: 'user',
            content: 'Test question',
          },
        ],
        max_tokens: 2000,
        temperature: 0.5,
      });
    });



    it('should log usage data', async () => {
      const client = new AzureAIClient();
      await client.askQuestion('Test question');

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.azure_ai_usage.log'),
        expect.stringContaining('"total_tokens":100'),
        'utf-8'
      );
    });

    it('should handle API errors', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const apiError = new Error('Internal Server Error');
      (apiError as any).status = 500;
      mockCreate.mockRejectedValue(apiError);

      const client = new AzureAIClient();
      const response = await client.askQuestion('Test');

      expect(response).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Erreur API: 500');
      consoleErrorSpy.mockRestore();
    });

    it('should handle connection errors', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const connectionError = new Error('Connection timeout');
      (connectionError as any).code = 'ETIMEDOUT';
      mockCreate.mockRejectedValue(connectionError);

      const client = new AzureAIClient();
      const response = await client.askQuestion('Test');

      expect(response).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Erreur de connexion')
      );
      consoleErrorSpy.mockRestore();
    });

    it('should handle missing choices in response', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockCreate.mockResolvedValue({
        choices: [],
        usage: {},
      });

      const client = new AzureAIClient();
      const response = await client.askQuestion('Test');

      expect(response).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Erreur de parsing de la réponse');
      consoleErrorSpy.mockRestore();
    });

    it('should handle logging errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      (fs.appendFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Disk full');
      });

      const client = new AzureAIClient();
      const response = await client.askQuestion('Test');

      expect(response).toBe('Test response');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Erreur lors de l'écriture du log")
      );
      consoleErrorSpy.mockRestore();
    });

    it('should preview long questions and responses in logs', async () => {
      const longQuestion = 'a'.repeat(150);
      const longResponse = 'b'.repeat(150);

      mockCreate.mockResolvedValue({
        choices: [{ message: { content: longResponse } }],
        usage: { total_tokens: 10 },
      });

      const client = new AzureAIClient();
      await client.askQuestion(longQuestion);

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('...'),
        'utf-8'
      );
    });
  });
});
