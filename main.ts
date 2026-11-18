// Token Radar — entrypoint (Node 22, standard library only).
//
// Reads the sealed snapshot, scores every rankable pre-token protocol
// with the model in lib/model.ts, and writes the entry's outputs:
//
//   board.json    the ranked board (rows 1..N by implied value)
//   data.js       the dashboard's dataset, written beside dashboard/
//   dashboard/    a copy of this repository's dashboard/
//   screenshots/  a copy of this repository's screenshots/
//   dossier.json  buildDossier's summary, written last so the scorer can
//                 rebuild it byte for byte from this /output.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for
// /output and --input points at the snapshot (a file, or a directory
// holding it):
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// The two runs must write identical bytes: the model is a pure function
// of the snapshot, the file copies are deterministic (name order), and
// the dossier is canonical JSON, so nothing here depends on time,
// randomness or the order the filesystem happens to return.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardProblem, buildBundle, bundleScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));

const TEXT_MAX_BYTES = 65_536;
const SHOT_LIMIT = { max: 4, max_bytes: 524_288 };
const DASH_LIMIT = { max_files: 400, max_bytes: 4_194_304 };
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function abort(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

/** Read `--name value` or `--name=value` from the arguments, else the fallback. */
function readOption(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === `--${name}` && i + 1 < argv.length) return argv[i + 1]!;
    if (arg.startsWith(`--${name}=`)) return arg.slice(name.length + 3);
  }
  return fallback;
}

/** Find the snapshot: an explicit --input, the env dir, or /input. */
function findSnapshot(): string {
  const given = readOption('input', process.env.MAKEFUN_INPUT_DIR ?? '/input');
  const candidate = given.endsWith('.json') ? given : join(given, 'snapshot.json');
  if (!existsSync(candidate)) {
    abort(`no snapshot at ${candidate}: pass --input <snapshot.json|directory> or mount the sealed /input`);
  }
  return candidate;
}

/** Find the output directory the same way. */
function findOutput(): string {
  return readOption('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
}

/**
 * Copy a directory tree into `dest`, skipping dot-names and refusing
 * anything that is not a regular file or directory. Returns the copied
 * relative paths in sorted order, so the run is deterministic.
 */
function copyDir(from: string, dest: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(dest, { recursive: true });
  const copied: string[] = [];
  const walk = (dir: string, rel: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const src = join(dir, entry.name);
      const next = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        mkdirSync(join(dest, next), { recursive: true });
        walk(src, next);
      } else if (entry.isFile()) {
        copyFileSync(src, join(dest, next));
        copied.push(next);
      } else {
        abort(`${src}: not a regular file or directory`);
      }
    }
  };
  walk(from, '');
  return copied.sort();
}

const snapshot = parseSnapshot(readFileSync(findSnapshot(), 'utf8'));
const { board, bundle } = buildBundle(snapshot);
const problem = boardProblem(board, snapshot);
if (problem !== null) abort(`the model wrote a board the gate refuses: ${problem}`);

const out = resolve(findOutput());
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), bundleScript(bundle));

const dashFiles = copyDir(join(repoRoot, 'dashboard'), join(out, 'dashboard'));
if (!dashFiles.includes('index.html')) abort('dashboard/ holds no index.html');
if (!dashFiles.some((f) => f.endsWith('.css'))) abort('dashboard/ holds no .css file');
if (!dashFiles.some((f) => f.endsWith('.js'))) abort('dashboard/ holds no .js file');

const shots = copyDir(join(repoRoot, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  abort(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`);
}
for (const name of shots) {
  if (!SHOT_NAME.test(name)) abort(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
  const bytes = statSync(join(out, 'screenshots', name)).size;
  if (bytes > SHOT_LIMIT.max_bytes) abort(`screenshots/${name} is ${bytes} bytes, over the 512 KiB cap`);
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SHOT_LIMIT, dashboard: DASH_LIMIT }),
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${bundle.early_size} below the floor, ${bundle.set_aside.total} pre-token set aside)\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, dashboard (${dashFiles.length} files), screenshots (${shots.length} images), ${join(out, 'dossier.json')}\n`,
);
