import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const tsx=readFileSync(new URL('../app/gestion/page.tsx', import.meta.url),'utf8');
const css=readFileSync(new URL('../app/gestion/gestion.module.css', import.meta.url),'utf8');

test('Pedidos muestra rubro, categoría y marca sin listas de desplazamiento interno',()=>{
 assert.match(tsx,/const saleDepartments=departments\.filter/);
 assert.match(tsx,/const matchingSaleProducts=products\.filter/);
 assert.match(tsx,/setSaleResultsLimit\(n=>n\+6\)/);
 assert.match(tsx,/setSaleBrowseOpen\(false\)/);
 assert.match(css,/\.productPicker\{max-height:none;overflow:visible/);
 assert.match(css,/\.choiceGrid\{display:grid/);
 assert.match(css,/\.chips\{flex-wrap:wrap;overflow:visible;max-height:none/);
});
test('Calendario tiene vistas de semana, mes y día sin datos ficticios',()=>{
 assert.match(tsx,/useState<'semana'\|'mes'\|'dia'>\('semana'\)/);
 assert.match(tsx,/calendarMode==='mes'/);
 assert.match(tsx,/calendarMode==='semana'/);
 assert.match(tsx,/calendarMode==='dia'/);
 assert.match(tsx,/calendarTasksByDay/);
 assert.match(tsx,/setTaskDate\(key\)/);
 assert.match(tsx,/Completar una tarea no confirma una entrega ni un cobro/);
 assert.match(css, /\.monthGrid\{display:grid;grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
 assert.match(css, /@media\(max-width:820px\)[\s\S]*\.weekGrid\{grid-template-columns:1fr/);
});
test('Se mantienen las operaciones y la lógica real de venta',()=>{
 assert.match(tsx, /jc_create_manual_sale/);
 assert.match(tsx, /jc_deliver_line/);
 assert.match(tsx, /jc_record_manual_receipt/);
 assert.match(tsx, /jc_set_stock_count/);
 assert.match(tsx, /js_is_admin|jc_is_admin/);
});
