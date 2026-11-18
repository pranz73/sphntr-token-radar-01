import { readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync, copyFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import { parseSnapshot, buildBoard, boardIssue, dataScript } from './lib/model.ts';

function args(argv: string[]) {
  let input = '/input';
  let output = process.env.MAKEFUN_OUTPUT_DIR || '/output';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && argv[i + 1]) input = argv[++i];
    else if (argv[i] === '--output' && argv[i + 1]) output = argv[++i];
    else throw new Error(`unknown or incomplete argument: ${argv[i]}`);
  }
  return { input, output };
}

function copyTree(src: string, dst: string) {
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src).sort()) {
    if (name.startsWith('.')) continue;
    const source = join(src, name);
    const target = join(dst, name);
    const stat = lstatSync(source);
    if (stat.isDirectory()) copyTree(source, target);
    else if (stat.isFile()) copyFileSync(source, target);
    else throw new Error(`unsupported dashboard entry: ${name}`);
  }
}

try {
  const { input, output } = args(process.argv.slice(2));
  const inPath = resolve(input);
  const snapshotPath = lstatSync(inPath).isDirectory()
    ? join(inPath, 'snapshot.json')
    : inPath;
  const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
  const rows = buildBoard(snapshot);
  const issue = boardIssue(snapshot, rows);
  if (issue) throw new Error(`board rejected: ${issue}`);

  const out = resolve(output);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), JSON.stringify({ rows }) + '\n');
  writeFileSync(join(out, 'data.js'), dataScript(snapshot, rows));

  const here = dirname(fileURLToPath(import.meta.url));
  copyTree(join(here, 'dashboard'), join(out, 'dashboard'));
  copyTree(join(here, 'screenshots'), join(out, 'screenshots'));
  const shots = readdirSync(join(out, 'screenshots'))
    .filter((name) => !name.startsWith('.'))
    .sort();
  if (shots.length < 3) {
    throw new Error(`screenshot check failed: found ${shots.length}, need at least 3`);
  }
  for (const name of shots) {
    if (!/^[A-Za-z0-9._-]+$/.test(name)) {
      throw new Error(`invalid screenshot name: ${name}`);
    }
  }

  const dossier = buildDossier(out, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  });
  writeFileSync(join(out, 'dossier.json'), dossier);
  console.log(
    `token-radar: ${rows.length} board rows, ${snapshot.watchlist.length} watchlist, ${snapshot.protocols.length} protocols`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
