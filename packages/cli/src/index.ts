#!/usr/bin/env node
import { Command } from 'commander';
import { doctor } from './doctor.js';
import { install } from './install.js';
import { start } from './start.js';
import { uninstall } from './uninstall.js';

const program = new Command();

program
  .name('solix')
  .description('Solix — a solar-system command center for Claude Code agents')
  .version('1.0.0');

program
  .command('start', { isDefault: true })
  .description('Start the Solix server and open the browser')
  .option('-p, --port <port>', 'port to listen on', (v) => parseInt(v, 10), 4242)
  .option('--no-open', 'do not open browser automatically')
  .action(async (opts: { port: number; open: boolean }) => {
    await start({ port: opts.port, noOpen: !opts.open });
  });

program
  .command('install')
  .description('Install Solix hooks into ~/.claude/settings.json')
  .option('--force', 'overwrite even if hooks already present')
  .action((opts: { force?: boolean }) => {
    install({ force: opts.force });
    console.log('\n[solix] install complete. Run `solix start` next.');
  });

program
  .command('uninstall')
  .description('Restore ~/.claude/settings.json from backup')
  .action(() => {
    uninstall();
  });

program
  .command('doctor')
  .description('Run diagnostics')
  .action(async () => {
    await doctor();
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
