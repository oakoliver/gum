#!/usr/bin/env node
/**
 * @oakoliver/gum CLI
 * A tool for glamorous shell scripts
 */

import { parseArgs, type ParsedArgs } from './parser.js';

// Command imports
import { run as runChoose } from './commands/choose.js';
import { run as runConfirm } from './commands/confirm.js';
import { run as runFile } from './commands/file.js';
import { run as runFormat } from './commands/format.js';
import { run as runInput } from './commands/input.js';
import { run as runJoin } from './commands/join.js';
import { run as runLog } from './commands/log.js';
import { run as runPager } from './commands/pager.js';
import { run as runSpin } from './commands/spin.js';
import { run as runStyle } from './commands/style.js';
import { run as runTable } from './commands/table.js';
import { run as runWrite } from './commands/write.js';

const VERSION = '1.0.2';

function printHelp(): void {
  console.log(`gum ${VERSION}
A tool for glamorous shell scripts.

Usage:
  gum <command> [flags]

Commands:
  choose     Choose option(s) from a list
  confirm    Ask a user to confirm an action
  file       Pick a file from a folder
  filter     Filter items from a list (coming soon)
  format     Format text using a template
  input      Prompt for input
  join       Join multiple strings
  log        Log a message with a level
  pager      Scroll through content
  spin       Display a spinner while running a command
  style      Apply styling to text
  table      Display data in a table
  write      Prompt for multi-line input

Flags:
  -h, --help     Show help
  -v, --version  Show version

Examples:
  gum choose "Option 1" "Option 2" "Option 3"
  gum confirm "Are you sure?"
  gum input --placeholder "Enter your name"
  gum spin --title "Loading..." -- sleep 3
  gum style --foreground 212 "Hello, World!"
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    printHelp();
    process.exit(0);
  }
  
  if (args[0] === '-v' || args[0] === '--version') {
    console.log(`gum version ${VERSION}`);
    process.exit(0);
  }
  
  const command = args[0];
  const parsed = parseArgs(args);
  
  try {
    switch (command) {
      case 'choose':
        await runChoose(parsed);
        break;
      case 'confirm':
        await runConfirm(parsed);
        break;
      case 'file':
        await runFile(parsed);
        break;
      case 'format':
        await runFormat(parsed);
        break;
      case 'input':
        await runInput(parsed);
        break;
      case 'join':
        await runJoin(parsed);
        break;
      case 'log':
        await runLog(parsed);
        break;
      case 'pager':
        await runPager(parsed);
        break;
      case 'spin':
        await runSpin(parsed);
        break;
      case 'style':
        await runStyle(parsed);
        break;
      case 'table':
        await runTable(parsed);
        break;
      case 'write':
        await runWrite(parsed);
        break;
      case 'filter':
        console.error('filter command is not yet implemented');
        process.exit(1);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main();
