/**
 * Poistaa AitoFit-kuvakaappauksista automaattisesti sovelluskromin: se tunnistaa
 * koko kuvan levyisen valkoisen liikepaneelin, peittää oikean yläkulman play-painikkeen
 * ja luo pelkän liikeillustration valkoisella taustalla. Alkuperäiset PNG:t säilyvät.
 * Komento luo 128px offline-kuvakkeet public/exercises/-kansioon ja 600px WebP-kuvat
 * media-upload/-kansioon R2:een vietäväksi.
 */
import { access, mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'

const root = resolve(import.meta.dirname, '..')
const mapPath = resolve(root, 'scripts/exercise-image-map.json')
const sourceDir = resolve(root, '..', 'Kuvat')
const thumbnailDir = resolve(root, 'public/exercises')
const fullDir = resolve(root, 'media-upload')

try { await access(mapPath) } catch { throw new Error('Puuttuu scripts/exercise-image-map.json. Katso tiedoston kommentti.') }
const mapping = JSON.parse(await readFile(mapPath, 'utf8'))
await mkdir(thumbnailDir, { recursive: true }); await mkdir(fullDir, { recursive: true })

async function cropExercisePanel(source) {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const isBrightRow = (y) => {
    let brightPixels = 0
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * info.channels
      if (data[offset] > 225 && data[offset + 1] > 225 && data[offset + 2] > 225) brightPixels++
    }
    return brightPixels / info.width > 0.62
  }
  const start = Array.from({ length: info.height }, (_, y) => y).find(isBrightRow)
  if (start == null) throw new Error(`Valkoista liikepaneelia ei löytynyt: ${source}`)
  const lastBrightRow = Array.from({ length: info.height - start }, (_, offset) => info.height - 1 - offset).find(isBrightRow)
  if (lastBrightRow == null || lastBrightRow - start < 300) throw new Error(`Liikepaneeli on odotettua pienempi: ${source}`)
  // Ohitetaan valkoisen paneelin yläreunassa oleva ohut sininen/harmaa sovellusviiva,
  // jotta trimmaus ei lukitse kuvaa koko ruudun leveyteen.
  const panelTop = Math.min(info.height - 1, start + 2)
  const panel = { left: 0, top: panelTop, width: info.width, height: Math.min(info.height - panelTop, lastBrightRow - panelTop + 1) }
  // Play-painike on kaikissa kaappauksissa paneelin oikeassa yläkulmassa.
  // Se peitetään ensin, jotta trimmaus rajaa vain liikeillustration.
  const maskWidth = Math.ceil(panel.width * 0.2)
  const maskHeight = Math.ceil(panel.height * 0.38)
  const playMask = Buffer.alloc(maskWidth * maskHeight * 4, 255)
  const sanitized = await sharp(source).extract(panel).composite([{
    input: playMask, raw: { width: maskWidth, height: maskHeight, channels: 4 }, left: panel.width - maskWidth, top: 0
  }]).png().toBuffer()
  return sharp(sanitized).trim({ background: '#ffffff', threshold: 12 }).extend({ top: 34, bottom: 34, left: 34, right: 34, background: '#ffffff' })
}

async function writeAsset(cropped, size, quality, destination) {
  await cropped.clone().resize(size, size, { fit: 'contain', background: '#ffffff' }).webp({ quality }).toFile(destination)
}

for (const [exerciseId, sourceName] of Object.entries(mapping)) {
  const source = resolve(sourceDir, sourceName)
  const cropped = await cropExercisePanel(source)
  await writeAsset(cropped, 128, 78, resolve(thumbnailDir, `${exerciseId}.webp`))
  await writeAsset(cropped, 600, 86, resolve(fullDir, `${exerciseId}.webp`))
}
console.log(`Valmisteltu ${Object.keys(mapping).length} liikekuvaa.`)
