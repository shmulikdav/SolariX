#!/usr/bin/env node
import { Command } from 'commander';
import {
  disableAdvisorCmd,
  enableAdvisorCmd,
  listAdvisorsCmd,
  pinAdvisorCmd,
  unpinAdvisorCmd,
} from './advisors.js';
import { doctor } from './doctor.js';
import {
  exportGalaxyCmd,
  importGalaxyCmd,
  installFromRegistryCmd,
  publishGalaxyCmd,
} from './galaxy.js';
import { install } from './install.js';
import { installSkillCmd, listSkillsCmd } from './skills.js';
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

const advisors = program
  .command('advisors')
  .description('Manage built-in advisor agents (PM, Builder, UX, etc.)');

advisors
  .command('list', { isDefault: true })
  .description('List all advisor agents and their state')
  .action(async () => {
    await listAdvisorsCmd();
  });

advisors
  .command('enable <id>')
  .description('Enable an advisor (renders in the inner crew ring)')
  .action(async (id: string) => {
    await enableAdvisorCmd(id);
  });

advisors
  .command('disable <id>')
  .description('Disable an advisor')
  .action(async (id: string) => {
    await disableAdvisorCmd(id);
  });

advisors
  .command('pin <id>')
  .description('Pin an advisor (always-on planet)')
  .action(async (id: string) => {
    await pinAdvisorCmd(id);
  });

advisors
  .command('unpin <id>')
  .description('Unpin an advisor (back to on-demand)')
  .action(async (id: string) => {
    await unpinAdvisorCmd(id);
  });

const skills = program
  .command('skills')
  .description('Manage discovered skills (asteroid belt)');

skills
  .command('list', { isDefault: true })
  .description('List all known skills (Anthropic + Solix pack)')
  .action(async () => {
    await listSkillsCmd();
  });

skills
  .command('install <id>')
  .description('Mark a skill as installed in a project')
  .option('--project <projectId>', 'project id (hash of cwd)')
  .action(async (id: string, opts: { project?: string }) => {
    await installSkillCmd(id, opts.project);
  });

const galaxy = program
  .command('galaxy')
  .description('Export and import shareable galaxy configurations');

galaxy
  .command('export <out>')
  .description('Export the current galaxy to a JSON manifest file')
  .option('--name <name>', 'galaxy name', 'My Galaxy')
  .option('--author <author>', 'author name')
  .option('--description <desc>', 'short description')
  .action(
    async (
      out: string,
      opts: { name?: string; author?: string; description?: string },
    ) => {
      await exportGalaxyCmd(out, opts);
    },
  );

galaxy
  .command('import <fileOrUrl>')
  .description('Import a galaxy manifest from a local file or URL')
  .action(async (fileOrUrl: string) => {
    await importGalaxyCmd(fileOrUrl);
  });

galaxy
  .command('publish <slug>')
  .description('Publish the current galaxy to the configured registry')
  .option('--name <name>', 'galaxy name', 'My Galaxy')
  .option('--author <author>', 'author name')
  .option('--description <desc>', 'short description')
  .action(
    async (
      slug: string,
      opts: { name?: string; author?: string; description?: string },
    ) => {
      await publishGalaxyCmd(slug, opts);
    },
  );

galaxy
  .command('install <slug>')
  .description('Pull and install a galaxy from the configured registry')
  .action(async (slug: string) => {
    await installFromRegistryCmd(slug);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
