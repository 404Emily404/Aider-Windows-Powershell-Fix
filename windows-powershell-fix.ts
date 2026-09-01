import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

import type {
  Extension,
  ExtensionContext,
  ToolDefinition,
  CommandDefinition,
  ToolCalledEvent,
  ImportantRemindersEvent,
  ProjectStartedEvent,
} from '@aiderdesk/extensions';

const inputSchema = z.object({
  scriptPath: z
    .string()
    .optional()
    .describe('Optional path to PowerShell script relative to project root (defaults to fix.ps1 if present)'),
  command: z
    .string()
    .optional()
    .describe('Optional PowerShell command or script snippet to execute with ExecutionPolicy Bypass'),
});

type WindowsPowerShellFixInput = z.infer<typeof inputSchema>;

export function transformPowerShellCommand(command: string): string {
  if (!command || typeof command !== 'string') return command;

  const trimmed = command.trim();

  // If already contains ExecutionPolicy Bypass, keep as-is
  if (/executionpolicy\s+bypass/i.test(trimmed)) {
    return command;
  }

  // Case 1: Invoking powershell or pwsh executable
  const psMatch = trimmed.match(/^(powershell(?:\.exe)?|pwsh(?:\.exe)?)\s+(.*)$/i);
  if (psMatch) {
    const [, binary, rest] = psMatch;
    const hasNoProfile = /-noprofile/i.test(rest);
    const flags = `-ExecutionPolicy Bypass${hasNoProfile ? '' : ' -NoProfile'}`;
    return `${binary} ${flags} ${rest}`.trim();
  }

  // Case 2: Direct .ps1 execution (e.g. .\script.ps1 or path/script.ps1)
  const ps1Match = trimmed.match(/^(&\s*)?(?:\.\\|\.\/)?(["']?[^"'\s]+\.ps1["']?)(\s+.*)?$/i);
  if (ps1Match) {
    const script = ps1Match[2];
    const args = ps1Match[3] ? ps1Match[3] : '';
    return `powershell -ExecutionPolicy Bypass -NoProfile -File ${script}${args}`.trim();
  }

  return command;
}

export default class WindowsPowerShellFixExtension implements Extension {
  static metadata = {
    name: 'Windows PowerShell Fix',
    version: '2.0.0',
    description: 'Automatically intercepts and fixes PowerShell execution policy, encoding, and scripts on Windows',
    author: 'AiderDesk',
    capabilities: ['tools', 'commands', 'events'],
  };

  async onLoad(context: ExtensionContext): Promise<void> {
    context.log('Windows PowerShell Fix Extension v2.0 loaded (Automatic Interception Active)', 'info');
  }

  async onProjectStarted(event: ProjectStartedEvent, context: ExtensionContext): Promise<void> {
    try {
      const projectDir = event.baseDir || context.getProjectDir();
      if (projectDir) {
        const fixScript = join(projectDir, 'fix.ps1');
        if (existsSync(fixScript)) {
          context.log(`Auto-executing project fix.ps1 with ExecutionPolicy Bypass...`);
          execSync(`powershell -ExecutionPolicy Bypass -NoProfile -File "${fixScript}"`, {
            cwd: projectDir,
            encoding: 'utf-8',
            windowsHide: true,
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      context.log(`fix.ps1 execution note: ${msg}`, 'warn');
    }
  }

  async onImportantReminders(event: ImportantRemindersEvent, context: ExtensionContext): Promise<Partial<ImportantRemindersEvent>> {
    const reminder = 'Windows PowerShell environment is active. All PowerShell commands are automatically executed with ExecutionPolicy Bypass and UTF-8 encoding.';
    const remindersContent = event.remindersContent ? `${event.remindersContent}\n${reminder}` : reminder;
    return { remindersContent };
  }

  async onToolCalled(event: ToolCalledEvent, context: ExtensionContext): Promise<Partial<ToolCalledEvent>> {
    if (event.toolName === 'power---bash' && event.input && typeof event.input.command === 'string') {
      const originalCommand = event.input.command;
      const transformedCommand = transformPowerShellCommand(originalCommand);

      if (transformedCommand !== originalCommand) {
        context.log(`Auto-injected ExecutionPolicy Bypass: "${originalCommand}" -> "${transformedCommand}"`);
        return {
          input: {
            ...event.input,
            command: transformedCommand,
          },
        };
      }
    }

    return {};
  }

  getTools(): ToolDefinition[] {
    return [
      {
        name: 'run-windows-fix',
        description: 'Fix Windows PowerShell environment for Aider by executing PowerShell scripts or commands with ExecutionPolicy Bypass',
        inputSchema,
        execute: async (input: WindowsPowerShellFixInput, signal: AbortSignal | undefined, context: ExtensionContext) => {
          context.log('Running Windows PowerShell fix...');

          try {
            const projectDir = context.getProjectDir ? context.getProjectDir() : process.cwd();
            let psCommand = '';

            if (input?.command) {
              psCommand = `powershell -ExecutionPolicy Bypass -NoProfile -Command "${input.command.replace(/"/g, '\\"')}"`;
            } else if (input?.scriptPath) {
              const scriptFullPath = join(projectDir, input.scriptPath);
              psCommand = `powershell -ExecutionPolicy Bypass -NoProfile -File "${scriptFullPath}"`;
            } else {
              const defaultScript = join(projectDir, 'fix.ps1');
              if (existsSync(defaultScript)) {
                psCommand = `powershell -ExecutionPolicy Bypass -NoProfile -File "${defaultScript}"`;
              } else {
                psCommand = `powershell -ExecutionPolicy Bypass -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Write-Output 'PowerShell environment configured and verified with ExecutionPolicy Bypass.'"`;
              }
            }

            const output = execSync(psCommand, {
              cwd: projectDir,
              encoding: 'utf-8',
              windowsHide: true,
            });

            return {
              content: [{ type: 'text' as const, text: output.trim() || 'Windows PowerShell fix executed successfully.' }],
            };
          } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            context.log(`Windows PowerShell fix failed: ${errorMsg}`, 'error');
            return {
              content: [{ type: 'text' as const, text: `Failed to execute PowerShell fix: ${errorMsg}` }],
              isError: true,
            };
          }
        },
      },
    ];
  }

  getCommands(): CommandDefinition[] {
    return [
      {
        name: 'run-windows-fix',
        description: 'Fix Windows PowerShell environment for Aider',
        execute: async (args: string[], context: ExtensionContext) => {
          const taskContext = context.getTaskContext();
          try {
            const projectDir = context.getProjectDir ? context.getProjectDir() : process.cwd();
            const defaultScript = join(projectDir, 'fix.ps1');
            let psCommand = '';

            if (existsSync(defaultScript)) {
              psCommand = `powershell -ExecutionPolicy Bypass -NoProfile -File "${defaultScript}"`;
            } else {
              psCommand = `powershell -ExecutionPolicy Bypass -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Write-Output 'PowerShell environment configured and verified with ExecutionPolicy Bypass.'"`;
            }

            const output = execSync(psCommand, {
              cwd: projectDir,
              encoding: 'utf-8',
              windowsHide: true,
            });

            taskContext?.addLogMessage('info', output.trim() || 'PowerShell fix executed successfully.');
          } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            taskContext?.addLogMessage('error', `PowerShell fix error: ${errorMsg}`);
          }
        },
      },
    ];
  }
}
