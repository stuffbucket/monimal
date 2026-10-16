import {
  analyzeReactImplementationFile,
  implementationAnalysisToMarkdown,
} from '../src/react-state-analysis.ts';
import {
  pulseCorrectnessCandidates,
  pulseBrowserAnalysisToMarkdown,
  runPulseBrowserAnalysis,
} from '../src/pulse-browser.mjs';

const arguments_ = process.argv.slice(2);
if (arguments_[0] === '--') arguments_.shift();
const [file, ...extra] = arguments_;
if (file === undefined || extra.length > 0) {
  process.stderr.write('Usage: pnpm pulse <implementation.tsx>\n');
  process.exitCode = 1;
} else {
  try {
    const analysis = analyzeReactImplementationFile(file);
    process.stdout.write(implementationAnalysisToMarkdown(analysis));
    const runtime = await runPulseBrowserAnalysis(file, analysis);
    process.stdout.write(pulseBrowserAnalysisToMarkdown(runtime));
    if (pulseCorrectnessCandidates(runtime).length > 0) process.exitCode = 1;
  } catch (caught: unknown) {
    process.stderr.write(`${caught instanceof Error ? caught.message : String(caught)}\n`);
    process.exitCode = 1;
  }
}
