import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it, vi } from 'vitest'

import { detectFfmpeg } from '../src/ffmpeg.js'
import { startWindowRecording } from '../src/main.js'

const directory = await mkdtemp(path.join(tmpdir(), 'recording-integration-'))

afterAll(() => rm(directory, { recursive: true, force: true }))

async function makeFrame(executable: string) {
  const child = spawn(executable, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=red:s=2x2',
    '-frames:v',
    '1',
    '-f',
    'image2pipe',
    '-vcodec',
    'png',
    'pipe:1',
  ])
  const chunks: Buffer[] = []
  let stderr = ''
  child.stdout.on('data', (chunk: Buffer) => {
    chunks.push(chunk)
  })
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  if (code !== 0) throw new Error(`ffmpeg frame generation exited ${String(code)}: ${stderr}`)
  return Buffer.concat(chunks)
}

async function probe(file: string, executable: string) {
  const child = spawn(executable, [
    '-v',
    'error',
    '-show_entries',
    'format=duration,size:stream=codec_name,width,height,nb_frames',
    '-of',
    'json',
    file,
  ])
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString()
  })
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  if (code !== 0) throw new Error(`ffprobe exited ${String(code)}: ${stderr}`)
  return JSON.parse(stdout) as {
    format: { duration: string; size: string }
    streams: Array<{
      codec_name: string
      width: number
      height: number
      nb_frames: string
    }>
  }
}

describe('real recording encoder', () => {
  it('writes captured PNG frames as a playable H.264 MP4', async ({ skip }) => {
    const status = await detectFfmpeg()
    if (status.state === 'missing') {
      skip(status.hint)
      return
    }
    const ffmpeg = status.tools.find(({ name }) => name === 'ffmpeg')
    const ffprobe = status.tools.find(({ name }) => name === 'ffprobe')
    if (!ffmpeg) throw new Error('ffmpeg detection returned no encoder.')
    if (!ffprobe) throw new Error('ffmpeg detection returned no probe.')
    const frame = await makeFrame(ffmpeg.path)

    const output = path.join(directory, 'playable.mp4')
    let captures = 0
    const startedAt = performance.now()
    const session = await startWindowRecording({
      output,
      fps: 30,
      onError: vi.fn(),
      captureFrame: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
        captures += 1
        return frame
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 600))
    const result = await session.stop()
    const elapsed = (performance.now() - startedAt) / 1000
    const metadata = await probe(output, ffprobe.path)

    expect(result.frames).toBeGreaterThanOrEqual(15)
    expect(captures).toBeGreaterThanOrEqual(result.frames)
    expect(captures).toBeLessThanOrEqual(result.frames + 1)
    expect(Number(metadata.format.size)).toBeGreaterThan(0)
    expect(Number(metadata.format.duration)).toBeGreaterThanOrEqual(elapsed * 0.8)
    expect(Number(metadata.format.duration)).toBeLessThanOrEqual(elapsed * 1.2)
    expect(metadata.streams).toEqual([
      expect.objectContaining({
        codec_name: 'h264',
        width: 2,
        height: 2,
      }),
    ])
    expect(Number(metadata.streams[0]?.nb_frames)).toBe(result.frames)
    expect((await readFile(output)).subarray(4, 8).toString()).toBe('ftyp')
  })
})
