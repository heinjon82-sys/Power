import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const sourceDirectory = path.join(root, 'generated-exercise-sources')
const thumbnailDirectory = path.join(root, 'public', 'exercises')
const fullDirectory = path.join(root, 'media-upload')

await fs.mkdir(thumbnailDirectory, { recursive: true })
await fs.mkdir(fullDirectory, { recursive: true })

const files = (await fs.readdir(sourceDirectory)).filter((file) => file.toLowerCase().endsWith('.png'))
for (const file of files) {
  const id = path.basename(file, path.extname(file))
  const source = path.join(sourceDirectory, file)
  const clean = () => sharp(source).trim({ background: '#ffffff', threshold: 12 })
  await clean().resize(128, 128, { fit: 'contain', background: '#ffffff' }).webp({ quality: 84 }).toFile(path.join(thumbnailDirectory, `${id}.webp`))
  await clean().resize(600, 600, { fit: 'contain', background: '#ffffff' }).webp({ quality: 88 }).toFile(path.join(fullDirectory, `${id}.webp`))
  console.log(`✓ ${id}`)
}

console.log(`Valmiit generoidut liikekuvat: ${files.length}`)
