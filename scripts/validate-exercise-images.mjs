import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const seed = JSON.parse(await fs.readFile(path.join(root, 'src', 'data', 'seed', 'engine_exercises.json'), 'utf8'))
const manifest = {}
const missing = []

for (const exercise of seed) {
  const thumb = path.join(root, 'public', 'exercises', `${exercise.exercise_id}.webp`)
  const full = path.join(root, 'media-upload', `${exercise.exercise_id}.webp`)
  try { await fs.access(thumb); await fs.access(full) } catch { missing.push(exercise.exercise_id) }
  manifest[exercise.exercise_id] = { thumb: `/exercises/${exercise.exercise_id}.webp`, full: `/media/${exercise.exercise_id}.webp` }
}

if (missing.length) {
  console.error(`Puuttuvat liikekuvat: ${missing.join(', ')}`)
  process.exit(1)
}
await fs.writeFile(path.join(root, 'public', 'exercise-image-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Liikekuvamanifesti kunnossa: ${Object.keys(manifest).length}/69`)
