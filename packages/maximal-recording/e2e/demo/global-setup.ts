import { detectFfmpeg } from '../../src/ffmpeg.js';

export default async function globalSetup(): Promise<void> {
  const status = await detectFfmpeg();

  if (status.state === 'missing') {
    throw new Error(`\n${status.hint}\n`);
  }

  for (const tool of status.tools) {
    process.env[tool.name === 'ffmpeg' ? 'FFMPEG' : 'FFPROBE'] = tool.path;
  }

  const ffmpeg = status.tools.find((tool) => tool.name === 'ffmpeg');
  console.log(`encoder: ${ffmpeg?.path ?? 'unknown'}`);
}
