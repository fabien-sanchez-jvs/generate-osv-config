/**
 * Unit tests for Console helper library
*/

// ⚠️ Mock readline module BEFORE imports
const mockQuestion = jest.fn();
const mockClose = jest.fn();

jest.mock('readline', () => ({
  createInterface: jest.fn(() => ({
    question: mockQuestion,
    close: mockClose,
  })),
}));

import { question } from './console';

describe('question', () => {
  beforeEach(() => {
    mockQuestion.mockClear();
    mockClose.mockClear();
  });

  it('should prompt user and return trimmed answer', async () => {
    mockQuestion.mockImplementation((prompt: string, callback: (answer: string) => void) => {
      callback('  user input  ');
    });

    const result = await question('Enter name');
    expect(result).toBe('user input');
    expect(mockQuestion).toHaveBeenCalledWith('Enter name : ', expect.any(Function));
    expect(mockClose).toHaveBeenCalled();
  });

  it('should handle empty input', async () => {
    mockQuestion.mockImplementation((prompt: string, callback: (answer: string) => void) => {
      callback('');
    });

    const result = await question('Confirm');
    expect(result).toBe('');
  });

  it('should handle whitespace-only input', async () => {
    mockQuestion.mockImplementation((prompt: string, callback: (answer: string) => void) => {
      callback('   ');
    });

    const result = await question('Enter value');
    expect(result).toBe('');
  });

  it('should close readline interface after getting answer', async () => {
    mockQuestion.mockImplementation((prompt: string, callback: (answer: string) => void) => {
      callback('answer');
    });

    await question('Test');
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('should format prompt with colon and space', async () => {
    mockQuestion.mockImplementation((prompt: string, callback: (answer: string) => void) => {
      callback('yes');
    });

    await question('Continue');
    expect(mockQuestion).toHaveBeenCalledWith('Continue : ', expect.any(Function));
  });
});
