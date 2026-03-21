/**
 * File listing utilities.
 * Port of charmbracelet/gum/internal/files
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const defaultIgnorePatterns = ['node_modules', '.git', '.'];

function shouldIgnore(filePath: string): boolean {
  for (const prefix of defaultIgnorePatterns) {
    if (filePath.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * List all files recursively from the current directory, ignoring .git and node_modules.
 */
export function listFiles(dir = '.'): string[] {
  const files: string[] = [];

  function walk(currentDir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const relativePath = path.join(currentDir, entry.name);
      if (shouldIgnore(relativePath) || shouldIgnore(entry.name)) continue;

      if (entry.isDirectory()) {
        walk(relativePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }

  walk(dir);
  return files;
}
