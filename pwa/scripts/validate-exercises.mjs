import fs from 'fs'
import path from 'path'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'

const schemaPath = path.join(process.cwd(), 'exercises.schema.json')
const dataPath = path.join(process.cwd(), 'public', 'exercises.json')

function exitWithError(msg) {
  console.error(msg)
  process.exit(1)
}

try {
  const schemaRaw = fs.readFileSync(schemaPath, 'utf8')
  const schema = JSON.parse(schemaRaw)
  const dataRaw = fs.readFileSync(dataPath, 'utf8')
  const data = JSON.parse(dataRaw)

  const ajv = new Ajv({ allErrors: true, strict: false })
  addFormats(ajv)
  const validate = ajv.compile(schema)
  const valid = validate(data)
  if (!valid) {
    console.error('exercises.json validation failed')
    console.error(validate.errors)
    process.exit(2)
  }
  console.log('exercises.json is valid (items=', (Array.isArray(data) ? data.length : 0) ,')')
} catch (e) {
  exitWithError('Validation script error: ' + (e && e.message ? e.message : e))
}
