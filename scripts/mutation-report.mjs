/**
 * What `npm run mutate` actually measured.
 *
 * Stryker's headline is a percentage over a denominator it chooses, and three
 * things can move that denominator without moving the percentage. A mutant
 * that crashes the runner is scored `RuntimeError` and leaves the denominator
 * entirely (#116). A mutant nothing imports is scored `NoCoverage`. A file
 * that silently drops off the mutate list produces no mutants at all (#102).
 * In all three cases the report still prints 100.00.
 *
 * So this reads the JSON report back and asserts the shape of the run, not
 * only its score: every kill names a test that reported, every file on the
 * list produced mutants, and nothing left the denominator.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';


/**
 * Statuses that take a mutant out of the denominator without failing the run.
 * `break: 100` says nothing about any of them.
 */
const OUTSIDE_THE_SCORE = ['RuntimeError', 'CompileError', 'NoCoverage', 'Ignored'];

const entriesIn = (report) =>
  Object.entries(report.files ?? {}).flatMap(([file, entry]) =>
    (entry.mutants ?? []).map((mutant) => ({ file, mutant })),
  );

const signature = ({ file, mutant }) =>
  JSON.stringify([file, mutant.mutatorName, mutant.location, mutant.replacement]);

export function verifyStaticRun(dynamicReport, staticReport) {
  const dynamicEntries = entriesIn(dynamicReport);
  const staticEntries = entriesIn(staticReport);
  const dynamicSignatures = new Set(dynamicEntries.map(signature));
  const staticResults = new Map(
    staticEntries.map((entry) => [signature(entry), entry.mutant.status]),
  );
  const canonicalStatic = dynamicEntries.filter(({ mutant }) => mutant.static === true);
  const failures = [];

  if (canonicalStatic.length === 0) failures.push('The static mutation scope is empty.');
  for (const entry of canonicalStatic) {
    const status = staticResults.get(signature(entry));
    if (status !== 'Killed') {
      failures.push(
        `${entry.file}:${entry.mutant.location.start.line} static mutant ended in ${status ?? 'Missing'}.`,
      );
    }
  }
  for (const entry of staticEntries) {
    if (!dynamicSignatures.has(signature(entry))) {
      failures.push(
        `${entry.file}:${entry.mutant.location.start.line} static run produced an unknown mutant.`,
      );
    }
    if (entry.mutant.status !== 'Killed') {
      failures.push(
        `${entry.file}:${entry.mutant.location.start.line} static run ended in ${entry.mutant.status}.`,
      );
    }
  }

  return {
    canonicalStatic: canonicalStatic.length,
    exercised: staticEntries.length,
    failures,
  };
}

export function readReport(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Every test the run knows about, by the id a mutant cites. */
function testsById(report) {
  const index = new Map();
  for (const [file, entry] of Object.entries(report.testFiles ?? {})) {
    for (const test of entry.tests ?? []) index.set(test.id, `${file} > ${test.name}`);
  }
  return index;
}

export function summarize(report) {
  const index = testsById(report);
  const statuses = new Map();
  const perFile = new Map();
  const unattributed = [];
  const dangling = [];
  const killers = new Set();
  let total = 0;

  for (const [file, entry] of Object.entries(report.files ?? {})) {
    perFile.set(file, entry.mutants.length);
    for (const mutant of entry.mutants) {
      total += 1;
      statuses.set(mutant.status, (statuses.get(mutant.status) ?? 0) + 1);
      if (mutant.status !== 'Killed') continue;
      const cited = mutant.killedBy ?? [];
      if (cited.length === 0) {
        unattributed.push(`${file}:${mutant.location.start.line} ${mutant.mutatorName}`);
        continue;
      }
      for (const id of cited) {
        if (index.has(id)) killers.add(id);
        else dangling.push(`${file}:${mutant.location.start.line} ${mutant.mutatorName} cites ${id}`);
      }
    }
  }

  return {
    total,
    statuses,
    perFile,
    unattributed,
    dangling,
    killers,
    knownTests: index.size,
    testFiles: Object.keys(report.testFiles ?? {}).length,
  };
}

/**
 * Assert the shape of a package's run, and exit non-zero when it is wrong.
 *
 * `mutantFloor` is the count the package last measured; it may only fall when
 * code is deleted on purpose. `ignoredCeiling` counts `// Stryker disable`
 * suppressions in mutants, because one comment covers every mutant on its line.
 *
 * @param {{ root: string, mutantFloor: number, ignoredCeiling: number, reportDirectory?: string }} options
 */
export function checkMutationReport({ root, mutantFloor, ignoredCeiling, reportDirectory = 'reports/mutation' }) {
  const reportArgument = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
  const file = path.resolve(root, reportArgument ?? `${reportDirectory}/mutation.json`);
  if (!existsSync(file)) {
    console.error(`No mutation report at ${path.relative(root, file)}. Run npm run mutate first.`);
    process.exit(1);
  }

  const report = readReport(file);
  const scope = summarize(report);
  const canonicalStatic = entriesIn(report).filter(({ mutant }) => mutant.static === true);
  const deferredStatic = entriesIn(report).filter(
    ({ mutant }) => mutant.status === 'Ignored' && mutant.static === true,
  );
  const listed = JSON.parse(readFileSync(path.join(root, 'stryker.conf.json'), 'utf8')).mutate ?? [];
  const failures = [];

  const counted = (status) => scope.statuses.get(status) ?? 0;
  console.log(
    `Mutation report: ${scope.total} mutants over ${scope.perFile.size} files, ` +
      `killed by ${scope.killers.size} of ${scope.knownTests} tests in ${scope.testFiles} test files`,
  );
  console.log(
    `  ${[...scope.statuses].map(([status, count]) => `${status} ${count}`).join(', ')}`,
  );

  // Floors before assertions, so the output distinguishes "this was wrong"
  // from "there was nothing to look at".
  if (scope.total === 0) failures.push('The report contains no mutants at all.');
  if (scope.knownTests === 0) failures.push('The report names no tests, so no kill can be attributed.');
  if (scope.total < mutantFloor) {
    failures.push(
      `${scope.total} mutants is below the floor of ${mutantFloor}. Something left the mutate list.`,
    );
  }
  for (const entry of listed) {
    if (!scope.perFile.has(entry)) failures.push(`${entry} is on the mutate list and produced no mutants.`);
  }

  for (const mutant of scope.unattributed) failures.push(`Killed with no killing test: ${mutant}`);
  for (const mutant of scope.dangling) failures.push(`Killed by a test the run never reported: ${mutant}`);

  for (const status of OUTSIDE_THE_SCORE) {
    const count = counted(status);
    if (status === 'Ignored') {
      const suppressed = count - deferredStatic.length;
      if (suppressed > ignoredCeiling) {
        failures.push(`${suppressed} suppressed mutants, above the declared ${ignoredCeiling}. A suppression was added.`);
      }
      continue;
    }
    if (count > 0) failures.push(`${count} mutants ended in ${status}, which the score does not count.`);
  }

  // A timeout kills without anything asserting anything. Stryker scores it as
  // a kill, so it is the one status that inflates the headline silently.
  if (counted('Timeout') > 0) failures.push(`${counted('Timeout')} mutants timed out. A timeout is not an assertion.`);

  if (canonicalStatic.length === 0) {
    failures.push('The static mutation scope is empty.');
  } else {
    const staticFile = path.resolve(root, `${reportDirectory}/static.json`);
    if (!existsSync(staticFile)) {
      failures.push('No static mutation report. Run npm run mutate first.');
    } else {
      const staticRun = verifyStaticRun(report, readReport(staticFile));
      failures.push(...staticRun.failures);
      console.log(
        `  ${staticRun.canonicalStatic} static mutants verified in a fresh process ` +
          `(${staticRun.exercised} mutants exercised)`,
      );
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(`\nMutation report: ${failures.length} problem(s).`);
    process.exit(1);
  }

  console.log('Every kill names a test that reported, and nothing left the denominator');
}
