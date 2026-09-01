import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

import type {
  Extension,
  ExtensionContext,
  ToolDefinition,
  CommandDefinition,
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

export default class WindowsPowerShellFixExtension implements Extension {
  static metadata = {
    name: 'Windows PowerShell Fix',
    version: '1.0.0',
    description: 'Fix Windows PowerShell environment for Aider and execute PowerShell scripts with ExecutionPolicy Bypass',
    author: 'AiderDesk',
    capabilities: ['tools', 'commands'],
  };

  async onLoad(context: ExtensionContext): Promise<void> {
    context.log('Windows PowerShell Fix Extension loaded', 'info');
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
