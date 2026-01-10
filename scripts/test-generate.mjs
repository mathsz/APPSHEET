import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Polyfill a minimal localStorage for the generator module
global.localStorage = {
  _store: {},
  getItem(k){ return this._store[k] ?? null },
  setItem(k,v){ this._store[k]=String(v) },
  removeItem(k){ delete this._store[k] }
}

const exercisesPath = path.resolve(process.cwd(), 'pwa/dist/exercises.json')
const data = JSON.parse(fs.readFileSync(exercisesPath, 'utf8'))

const genPath = path.resolve(process.cwd(), 'pwa/src/generator.js')
const gen = await import('file://' + genPath)

try {
  gen.loadExercises(data)
  console.log('Loaded exercises:', gen.listExercises().length)
} catch (e) { console.error('loadExercises failed', e); process.exit(2) }

// Helper to run scenario
async function runScenario(name, setupObj) {
  try {
    // clear localStorage keys
    localStorage._store = {}
    if (setupObj) {
      localStorage.setItem('homeworkouts_setup_temp', JSON.stringify(setupObj))
      localStorage.setItem('homeworkouts_program_type', setupObj.programType)
      localStorage.setItem('homeworkouts_sets', String(setupObj.setCount))
      localStorage.setItem('homeworkouts_equipment', setupObj.equipment || '')
    }
    const stored = setupObj ? JSON.parse(localStorage.getItem('homeworkouts_setup_temp')) : null
    console.log('\nScenario:', name, 'stored?', !!stored)
    let use = stored || { programType: localStorage.getItem('homeworkouts_program_type') || 'Strength', setCount: parseInt(localStorage.getItem('homeworkouts_sets')||'3',10) }
    const w = (String(use.programType).toLowerCase().includes('hiit')) ? gen.generateWorkout({ count: use.setCount }) : gen.generateWorkout({ count: use.setCount, constraints: { equipment: use.equipment || null } })
    console.log('Requested count:', use.setCount, 'Generated:', Array.isArray(w)?w.length:0)
    if (Array.isArray(w)) w.slice(0,5).forEach((e,i)=> console.log(i+1, e.name || e.id))
  } catch (e) { console.error('scenario failed', e) }
}

await runScenario('No setup (defaults)', null)
await runScenario('Strength with kettlebell', { programType: 'Strength', setCount: 4, durationMin: 30, equipment: 'Kettlebell', savedAt: new Date().toISOString() })
await runScenario('HIIT default', { programType: 'HIIT', setCount: 6, durationMin: 20, equipment: '', savedAt: new Date().toISOString() })

console.log('\nDone')
