const { loadExercises, generateWorkout } = require('../src/generator.js');
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('public/exercises.generator.json', 'utf8'));
loadExercises(data);
const result = generateWorkout({ equipment: 'bench', Category: 'upper body', programType: 'strength', durationMin: 45 });
console.log(JSON.stringify(result, null, 2));