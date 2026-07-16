import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const ffmpeg = require('ffmpeg-static')
const input = process.argv[2]
const output = process.argv[3]

if (!input || !output) {
  console.error('Käyttö: node scripts/generate-background-video.mjs lähde.jpeg kohde.mp4')
  process.exit(2)
}

const filter = "zoompan=z='1.06+0.025*(1-cos(2*PI*on/240))/2':x='iw/2-(iw/zoom/2)+6*sin(2*PI*on/240)':y='ih/2-(ih/zoom/2)+10*cos(2*PI*on/240)':d=240:s=390x844:fps=24,eq=saturation=0.72:contrast=1.05:brightness=-0.06,format=yuv420p"
const result = spawnSync(ffmpeg, [
  '-y', '-loop', '1', '-i', path.resolve(input), '-vf', filter, '-frames:v', '240',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-movflags', '+faststart', '-an', path.resolve(output)
], { stdio: 'inherit' })

process.exit(result.status ?? 1)
