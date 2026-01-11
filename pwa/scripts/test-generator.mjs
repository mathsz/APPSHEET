import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/exercises.sample.json'), 'utf8'))

import { loadExercises, generateWorkout } from '../src/generator.js'

loadExercises(sample)
const w = generateWorkout({count: 5})
console.log('Generated workout (count=' + w.length + '):')
w.forEach((e, i) => console.log(`${i+1}. ${e.name} [${e.equipment.join(', ')}] - ${e.muscles.join(', ')}`))
