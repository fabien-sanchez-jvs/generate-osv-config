/**
 * Console helper library
 * Provides user interaction utilities
 */

import * as readline from 'readline';

/**
 * Ask user a question and get input
 */
export function question(msg: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${msg} : `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
