const fs = require('fs');
const path = 'src/Pages/WorkoutCheckPage.tsx';
let c = fs.readFileSync(path, 'utf8');

// non-dynamic <i className="...fa..."></i> -> exact replace
const simple = [
  ['<i className="fa-solid fa-layer-group mr-1"></i>', '<Layers className="mr-1" />'],
  ['<i className="fa-solid fa-clock-rotate-left mr-1"></i>', '<History className="mr-1" />'],
  ['<i className="fa-solid fa-trophy mr-1"></i>', '<Trophy className="mr-1" />'],
  ['<i className="fa-solid fa-circle-notch fa-spin mr-1"></i>', '<Loader2 className="mr-1" />'],
  ['<i className="fa-solid fa-check mr-1"></i>', '<Check className="mr-1" />'],
  ['<i className="fa-regular fa-calendar mr-1"></i>', '<Calendar className="mr-1" />'],
  ['<i className="fa-solid fa-fire mr-1"></i>', '<Flame className="mr-1" />'],
  ['<i className="fa-solid fa-note-sticky mr-1"></i>', '<StickyNote className="mr-1" />'],
  ['<i className="fa-solid fa-flag-checkered mr-1"></i>', '<Flag className="mr-1" />'],
  ['<i className="fa-solid fa-times"></i>', '<X />'],
  ['<i className="fa-solid fa-medal"></i>', '<Medal />'],
  ['<i className="fa-solid fa-save mr-1"></i>', '<Save className="mr-1" />'],
  ['<i className="fa-solid fa-layer-group mr-1"></i>Templates', '<Layers className="mr-1" />Templates'],
];
for (const [o, n] of simple) {
  if (c.includes(o)) { c = c.split(o).join(n); }
}

// dynamic ternary
const dyn = '<i className={`fa-solid ${exercise.completed ? \'fa-check-circle\' : \'fa-circle\'}`}></i>';
if (c.includes(dyn)) {
  c = c.split(dyn).join('{exercise.completed ? <CircleCheck /> : <Circle />}');
}

// group header with Layers (Already covered above: fa-layer-group mr-1 -> Layers)
fs.writeFileSync(path, c);
console.log('remaining fa-:', (c.match(/fa-/g) || []).length);
