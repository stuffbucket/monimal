import { detectFfmpeg } from '../../src/main/native/ffmpeg.js';
import { requireFreshBundles } from '../global-setup.js';

/**
 * Prove the encoder is there, and the build is current, before anything
 * launches.
 *
 * A recording spends minutes driving a real application and only reaches the
 * encoder at the very end. Discovering a missing `ffmpeg` there wastes the
 * whole run, so the check happens here instead. The same argument applies to a
 * stale bundle, which wastes the run and then produces a video of the previous
 * build without saying so.
 *
 * `globalSetup` runs once, in the main process, before any worker spawns.
 * Workers inherit its environment, so pinning the resolved paths makes every
 * later lookup agree with what was actually tested.
 *
 * Nothing is installed on the user's behalf. The message names the one command
 * that fixes it, and says to run the recording again afterwards.
 */
export default async function globalSetup(): Promise<void> {
  requireFreshBundles();

  const status = await detectFfmpeg();

  if (status.state === 'missing') {
    // Playwright prints the message and aborts the run. A thrown Error keeps
    // the exit code non-zero, so a scripted caller notices too.
    throw new Error(`\n${status.hint}\n`);
  }

  for (const tool of status.tools) {
    process.env[tool.name === 'ffmpeg' ? 'FFMPEG' : 'FFPROBE'] = tool.path;
  }

  const ffmpeg = status.tools.find((tool) => tool.name === 'ffmpeg');
  // eslint-disable-next-line no-console
  console.log(`encoder: ${ffmpeg?.path ?? 'unknown'}`);
}
