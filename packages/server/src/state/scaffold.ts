import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Filesystem + git side of the build-studio "New Project" flow: create the
 * project directory, drop a minimal template scaffold, and `git init` +
 * baseline commit so the review surface can diff what Maestro changes against a
 * clean starting point. Kept out of the DB layer so both are independently
 * testable (this against a temp dir, the DB write against `:memory:`).
 */

export type ProjectTemplate = 'empty' | 'node' | 'web' | 'python';

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  'empty',
  'node',
  'web',
  'python',
];

function isTemplate(v: string): v is ProjectTemplate {
  return (PROJECT_TEMPLATES as string[]).includes(v);
}

/** Where user projects are created when no explicit path is given. */
export function defaultProjectsDir(): string {
  return process.env.SOLIX_PROJECTS_DIR ?? join(homedir(), 'SolixProjects');
}

/** Template file sets. Deliberately tiny — a real, buildable starting point
 *  without turning Solix into a scaffolding tool. `%NAME%` is substituted. */
function templateFiles(
  template: ProjectTemplate,
  name: string,
): Array<{ path: string; content: string }> {
  const readme = {
    path: 'README.md',
    content: `# ${name}\n\nCreated with Solix. Describe a goal and let Maestro build it.\n`,
  };
  switch (template) {
    case 'node':
      return [
        readme,
        {
          path: 'package.json',
          content: `${JSON.stringify(
            {
              name: name,
              version: '0.1.0',
              type: 'module',
              scripts: { start: 'node index.js' },
            },
            null,
            2,
          )}\n`,
        },
        {
          path: 'index.js',
          content: `console.log('Hello from ${name}');\n`,
        },
        { path: '.gitignore', content: 'node_modules\n' },
      ];
    case 'web':
      return [
        readme,
        {
          path: 'index.html',
          content: `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>${name}</title>\n    <link rel="stylesheet" href="styles.css" />\n  </head>\n  <body>\n    <h1>${name}</h1>\n    <p>Built with Solix.</p>\n  </body>\n</html>\n`,
        },
        {
          path: 'styles.css',
          content: `body { font-family: system-ui, sans-serif; margin: 3rem; }\n`,
        },
      ];
    case 'python':
      return [
        readme,
        { path: 'main.py', content: `print("Hello from ${name}")\n` },
        { path: '.gitignore', content: '__pycache__/\n*.pyc\n' },
      ];
    case 'empty':
    default:
      return [readme];
  }
}

export interface ScaffoldResult {
  ok: boolean;
  cwd: string;
  error?: string;
}

/**
 * Create `cwd` (recursively), write the template's files (never clobbering
 * existing ones), then `git init` + a baseline commit if the directory isn't
 * already a repo. Refuses to scaffold into a directory that already has files
 * but no git — that's almost certainly not what the user meant, and we don't
 * want to litter an existing folder.
 */
export function scaffoldProject(input: {
  cwd: string;
  name: string;
  template?: string;
}): ScaffoldResult {
  const cwd = input.cwd;
  const template: ProjectTemplate =
    input.template && isTemplate(input.template) ? input.template : 'empty';

  try {
    const preexisting = existsSync(cwd);
    const alreadyRepo = preexisting && existsSync(join(cwd, '.git'));
    if (preexisting && !alreadyRepo && readdirSync(cwd).length > 0) {
      return {
        ok: false,
        cwd,
        error:
          'target directory already exists and is not empty; choose a new name or location',
      };
    }

    mkdirSync(cwd, { recursive: true });
    for (const f of templateFiles(template, input.name)) {
      const dest = join(cwd, f.path);
      if (!existsSync(dest)) writeFileSync(dest, f.content, 'utf8');
    }

    if (!alreadyRepo) {
      const git = (args: string[]): void => {
        const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
        if (r.status !== 0) {
          throw new Error(
            `git ${args[0]} failed: ${(r.stderr || r.error?.message || '').slice(0, 200)}`,
          );
        }
      };
      git(['init']);
      git(['add', '-A']);
      // Set identity per-invocation so the commit never fails on an unconfigured
      // machine, without touching the user's global git config.
      git([
        '-c',
        'user.email=maestro@solix.local',
        '-c',
        'user.name=Solix Maestro',
        'commit',
        '-m',
        'Initial scaffold',
      ]);
    }

    return { ok: true, cwd };
  } catch (err) {
    return { ok: false, cwd, error: (err as Error).message };
  }
}
