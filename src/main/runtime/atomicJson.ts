import { promises as fs } from 'fs'
import { dirname } from 'path'
import { randomUUID } from 'crypto'

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  const temporary = path + '.' + randomUUID() + '.tmp'
  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, 2), 'utf8')
    await fs.rename(temporary, path)
  } finally {
    await fs.unlink(temporary).catch(() => undefined)
  }
}
