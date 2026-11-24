'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {ArrowLeft,ArrowRight,Check,ChevronRight,Clock3,Filter,LockKeyhole,LogOut,Minus,Percent,Plus,RefreshCw,Search,ShieldCheck,Store,Tags,X} from 'lucide-react';
import styles from './pricing.module.css';

type Offer={id:string;presentation:'pack'|'unit';units_base:number;unit_label:string;price_cents:number|null;enabled:boolean};
type Product={id:string;sku:string;name:string;brand:string;family:string;supplier:string|null;original_presentation:string;base_unit:string;pack_base_qty:number;purchase_cost_ars:number|null;original_purchase_cost_ars:number|null;tax_source:string|null;jc_offers:Offer[]};
type Change={id:number;sku_snapshot:string;presentation_snapshot:'unit'|'pack'|null;target:'cost'|'price';old_value:number|null;new_value:number;created_at:string};
type Mode='cost'|'pack'|'unit';
const ars=new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2});
const cash=(n:number|null|undefined)=>n==null?'Sin cargar':ars.format(n);
const cents=(n:number|null|undefined)=>n==null?'Sin cargar':ars.format(n/100);
const numberInput=(n:number|null|undefined)=>n==null?'':String(n);
const currencyInput=(n:number|null|undefined)=>n==null?'':String(n/100);
function offerOf(p:Product,presentation:'pack'|'unit'){return p.jc_offers.find(o=>o.presentation===presentation);}
function computed(old:number,pct:number,isCents:boolean){return isCents?Math.round(old*(1+pct/100)):Math.round((old*(1+pct/100)+Number.EPSILON)*100)/100;}
function validNum(s:string){if(!s.trim())return null;const n=Number(s.trim().replace(',','.'));return Number.isFinite(n)?n:null;}
function dbClient():SupabaseClient|null{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 return url&&key?createClient(url,key):null;
}
const blankDraft={cost:'',pack:'',unit:''};

export default function PricingAdmin(){
 const db=useMemo(()=>dbClient(),[]);
 const [auth,setAuth]=useState<'checking'|'login'|'ready'|'denied'|'config'>('checking');
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [success,setSuccess]=useState('');
 const [products,setProducts]=useState<Product[]>([]);const [loading,setLoading]=useState(false);
 const [search,setSearch]=useState('');const [family,setFamily]=useState('Todas');const [brand,setBrand]=useState('Todas');
 const [onlyMissing,setOnlyMissing]=useState(false);const [chosen,setChosen]=useState<string[]>([]);
 const [editId,setEditId]=useState<string|null>(null);const [draft,setDraft]=useState(blankDraft);
 const [mode,setMode]=useState<Mode>('cost');const [pctStr,setPctStr]=useState('5');const [fromCost,setFromCost]=useState(false);const [bulkKey,setBulkKey]=useState('');const [manualKey,setManualKey]=useState('');const [direction,setDirection]=useState<'up'|'down'>('up');
 const [confirm,setConfirm]=useState(false);const [note,setNote]=useState('');
 const [changes,setChanges]=useState<Change[]>([]);const [historyOpen,setHistoryOpen]=useState(false);

 const refresh=useCallback(async (client:SupabaseClient)=>{
  setLoading(true);setError('');
  try{
   const [p,h]=await Promise.all([
    client.from('jc_products').select('id,sku,name,brand,family,supplier,original_presentation,base_unit,pack_base_qty,purchase_cost_ars,original_purchase_cost_ars,tax_source,jc_offers(id,presentation,units_base,unit_label,price_cents,enabled)').order('sku').range(0,999),
    client.from('jc_pricing_changes').select('id,sku_snapshot,presentation_snapshot,target,old_value,new_value,created_at').order('id',{ascending:false}).limit(40)
   ]);
   if(p.error)throw p.error;
   setProducts((p.data??[]) as Product[]);
   if(!h.error)setChanges((h.data??[]) as Change[]);
  }catch(e){setError(e instanceof Error?e.message:'No se pudieron leer los artículos');}
  finally{setLoading(false);}
 },[]);
 const validateAdmin=useCallback(async (client:SupabaseClient)=>{
  const u=await client.auth.getUser();
  if(u.error||!u.data.user){setAuth('login');return;}
  const a=await client.rpc('jc_is_admin');
  if(a.error||a.data!==true){setAuth('denied');return;}
  setAuth('ready');await refresh(client);
 },[refresh]);
 useEffect(()=>{if(!db){setAuth('config');return;}void validateAdmin(db);},[db,validateAdmin]);
 const login=async(e:React.FormEvent)=>{
  e.preventDefault();if(!db)return;setError('');setBusy(true);
  try{const r=await db.auth.signInWithPassword({email,password});if(r.error)throw r.error;setPassword('');await validateAdmin(db);}
  catch(e){setError(e instanceof Error?e.message:'No se pudo ingresar');}
  finally{setBusy(false);}
 };
 const logout=async()=>{await db?.auth.signOut();setProducts([]);setAuth('login');};
 const families=useMemo(()=>[...new Set(products.map(p=>p.family))].sort((a,b)=>a.localeCompare(b,'es')),[products]);
 const brands=useMemo(()=>[...new Set(products.filter(p=>family==='Todas'||p.family===family).map(p=>p.brand))].sort((a,b)=>a.localeCompare(b,'es')),[products,family]);
 const visible=useMemo(()=>products.filter(p=>{
  const term=`${p.name} ${p.sku} ${p.brand} ${p.supplier||''}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const query=search.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const incomplete=p.jc_offers.some(o=>o.price_cents==null);
  return (family==='Todas'||p.family===family)&&(brand==='Todas'||p.brand===brand)&&term.includes(query)&&(!onlyMissing||incomplete);
 }),[products,search,family,brand,onlyMissing]);
 const selected=useMemo(()=>visible.filter(p=>chosen.includes(p.id)),[visible,chosen]);
 const selectedAll=visible.length>0&&visible.every(p=>chosen.includes(p.id));
 const current=products.find(p=>p.id===editId);
 const withCost=products.filter(p=>p.purchase_cost_ars!=null).length;
 const withPrices=products.filter(p=>p.jc_offers.some(o=>o.price_cents!=null)).length;
 const pct=validNum(pctStr);
 const signedPct=pct===null?null:fromCost?pct:direction==='up'?pct:-pct;
 const targetRows=selected.flatMap(p=>{
  if(mode==='cost')return [{p,offer:null as Offer|null,old:p.purchase_cost_ars,isCents:false}];
  const o=offerOf(p,mode);
  return o?[{p,offer:o,old:o.price_cents,isCents:true}]:[];
 });
 const preview=targetRows.map(v=>({...v,next:signedPct===null?null:fromCost&&mode!=='cost'?(v.p.purchase_cost_ars!=null&&v.offer?Math.round(v.p.purchase_cost_ars*Number(v.offer.units_base)/Number(v.p.pack_base_qty)*(1+signedPct/100)*100):null):(v.old!==null?computed(v.old,signedPct,v.isCents):null)}));
 const skipped=preview.filter(v=>v.next===null).length;
 const changeable=preview.filter(v=>v.next!==null&&v.old!==v.next).length;
 const filteredSelected=selected.length;
 const toggleAll=()=>setChosen(selectedAll?chosen.filter(id=>!visible.some(p=>p.id===id)):[...new Set([...chosen,...visible.map(p=>p.id)])]);
 const enterEdit=(p:Product)=>{setEditId(p.id);setDraft({cost:numberInput(p.purchase_cost_ars),pack:currencyInput(offerOf(p,'pack')?.price_cents),unit:currencyInput(offerOf(p,'unit')?.price_cents)});setError('');setSuccess('');setManualKey(crypto.randomUUID());};
 const save=async()=>{
  if(!db||!current)return;
  const cost=validNum(draft.cost),pack=validNum(draft.pack),unit=validNum(draft.unit);
  if(cost===null||cost<0||Math.abs(cost*100-Math.round(cost*100))>1e-6){setError('Ingresá un costo válido, con hasta dos decimales.');return;}
  if((draft.pack.trim()&&(!pack||pack<=0))||(draft.unit.trim()&&(!unit||unit<=0))){setError('Los precios de venta deben ser mayores que cero.');return;}
  if(current.jc_offers.some(o=>o.presentation==='pack'&&o.price_cents!=null)&&!draft.pack.trim()||current.jc_offers.some(o=>o.presentation==='unit'&&o.price_cents!=null)&&!draft.unit.trim()){
    setError('Para retirar un precio publicado usá la desactivación de la oferta. No lo borres dejando el campo vacío.');return;
  }
  if(pack!==null&&!offerOf(current,'pack')||unit!==null&&!offerOf(current,'unit')){setError('La presentación de venta no está creada en la base.');return;}
  setBusy(true);setError('');setSuccess('');
  try{
    const r=await db.rpc('jc_save_product_pricing',{
      p_product:current.id,p_cost:cost,
      p_pack_cents:pack==null?null:Math.round(pack*100),
      p_unit_cents:unit==null?null:Math.round(unit*100),
      p_note:'Edición manual desde JC Gestión',p_operation:manualKey||crypto.randomUUID()
    });
    if(r.error)throw r.error;
    setManualKey('');setEditId(null);setSuccess(`Guardado ${current.sku}: ${r.data?.updated??0} valor(es) modificado(s).`);
    await refresh(db);
  }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar');}
  finally{setBusy(false);}
 };
 const applyBulk=async()=>{
  if(!db||signedPct===null)return;
  if(signedPct<=-100||signedPct>1000||(fromCost&&signedPct<0)){setError('Porcentaje fuera de rango.');return;}
  setBusy(true);setError('');setSuccess('');
  try{
   const ids=mode==='cost'?selected.map(p=>p.id):selected.map(p=>offerOf(p,mode)?.id).filter((x):x is string=>!!x);
   if(!ids.length)throw new Error('No hay registros para modificar');
   const result=await db.rpc('jc_apply_pricing_change',{
     p_ids:ids,p_target:mode==='cost'?'cost':'price',p_mode:fromCost?'from_cost':'percent',p_value:signedPct,
     p_note:note||`${fromCost?'Recargo desde costo':'Ajuste'} ${signedPct}% desde JC Gestión (${mode})`,p_operation:bulkKey||crypto.randomUUID()
   });
   if(result.error)throw result.error;
   setSuccess(`Actualización registrada: ${result.data?.updated??0} modificados; ${result.data?.skipped??0} sin cambios.`);
   setConfirm(false);setBulkKey('');setChosen([]);setNote('');await refresh(db);
  }catch(e){setError(e instanceof Error?e.message:'No se pudo actualizar');}
  finally{setBusy(false);}
 };
 const isEditable=auth==='ready';
 return <div className={styles.shell}>
  <aside className={styles.sidebar} aria-label="JC Gestión">
   <div className={styles.logo}>JC<span> Gestión</span></div>
   <div className={styles.sideCaption}>ADMINISTRACIÓN PRIVADA</div>
   <div className={styles.sideSection}>Catálogo</div>
   <div className={styles.sideActive}><Tags size={18}/> Costos y precios <ChevronRight size={15}/></div>
   <div className={styles.sideInfo}>El catálogo y la tienda comparten los mismos SKU.</div>
   {isEditable&&<button className={styles.logout} onClick={logout}><LogOut size={16}/> Cerrar sesión</button>}
  </aside>
  <main className={styles.main}>
   <div className={styles.topbar}><strong>JC <span>Gestión</span></strong><span><LockKeyhole size={15}/> Área privada</span></div>
   <div className={styles.content}>
    <div className={styles.header}><div><span className={styles.eyebrow}>PRODUCTOS / TARIFAS</span><h1>Costos y precios</h1><p>Modificá por SKU, marca o categoría. La tienda toma los precios desde esta misma base.</p></div>{isEditable&&<div className={styles.headerActions}><button onClick={()=>db&&refresh(db)} disabled={loading} className={styles.secondary}><RefreshCw size={16}/> Actualizar</button><button className={styles.secondary} onClick={()=>setHistoryOpen(!historyOpen)}><Clock3 size={16}/> Historial</button></div>}</div>
    {error&&<div className={styles.alert} role="alert">{error}<button onClick={()=>setError('')} aria-label="Cerrar"><X size={15}/></button></div>}
    {success&&<div className={styles.notice} role="status"><Check size={17}/>{success}<button onClick={()=>setSuccess('')} aria-label="Cerrar"><X size={15}/></button></div>}
    {auth==='config'&&<div className={styles.loginCard}><LockKeyhole size={28}/><h2>Falta conectar Supabase</h2><p>Completá <code>NEXT_PUBLIC_SUPABASE_URL</code> y <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> para administrar los valores. Los datos están preparados en la migración del proyecto.</p></div>}
    {auth==='checking'&&<div className={styles.loginCard}>Verificando acceso a JC…</div>}
    {auth==='denied'&&<div className={styles.loginCard}><LockKeyhole/><h2>Usuario sin autorización</h2><p>Solo una cuenta incluida en <code>jc_admin_users</code> puede ver costos y precios.</p><button className={styles.primary} onClick={logout}>Cerrar sesión</button></div>}
    {auth==='login'&&<form className={styles.loginCard} onSubmit={login}><LockKeyhole size={27}/><h2>Ingresar a JC Gestión</h2><p>Área privada para administrar precios y costos de los productos.</p><label>Email<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Contraseña<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy} className={styles.primary} type="submit">{busy?'Ingresando…':'Ingresar'}</button></form>}
    {isEditable&&<>
     <section className={styles.stats} aria-label="Resumen"><div><span>Artículos en catálogo</span><strong>{products.length}</strong><small>SKU únicos</small></div><div><span>Con costo registrado</span><strong>{withCost}</strong><small>Importados de la lista JC</small></div><div><span>Con algún precio de tienda</span><strong>{withPrices}</strong><small>Los demás quedan sin publicar</small></div></section>
     <div className={styles.filters}><div className={styles.search}><Search size={18}/><input aria-label="Buscar por SKU, nombre o proveedor" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar SKU, producto o marca…"/></div><label><Filter size={14}/> Tipo de producto<select value={family} onChange={e=>{setFamily(e.target.value);setBrand('Todas');setChosen([]);}}><option>Todas</option>{families.map(f=><option key={f}>{f}</option>)}</select></label><label>Marca<select value={brand} onChange={e=>{setBrand(e.target.value);setChosen([]);}}><option>Todas</option>{brands.map(b=><option key={b}>{b}</option>)}</select></label><label className={styles.checkbox}><input type="checkbox" checked={onlyMissing} onChange={e=>setOnlyMissing(e.target.checked)}/> Sin precio de tienda</label></div>
     <div className={styles.workbar}><label className={styles.checkbox}><input type="checkbox" checked={selectedAll} onChange={toggleAll}/> Seleccionar visibles <span>({visible.length})</span></label><span>{chosen.length} seleccionados · {loading?'Actualizando…':'Todos los importes en pesos argentinos'}</span></div>
     <div className={styles.tableWrap}>
      <div className={styles.tableHead}><span>Artículo / SKU</span><span>Costo de compra</span><span>Precio bulto</span><span>Precio individual</span><span></span></div>
      <div className={styles.rows}>
       {visible.map(p=><div className={styles.productRow} key={p.id}>
        <label className={styles.productIdentity}><input type="checkbox" checked={chosen.includes(p.id)} onChange={e=>setChosen(e.target.checked?[...new Set([...chosen,p.id])]:chosen.filter(id=>id!==p.id))}/><span className={styles.productText}><b>{p.name}</b><span><code>{p.sku}</code> · {p.brand} · {p.original_presentation}</span></span></label>
        <div className={styles.cell}><small>Costo compra</small><strong>{cash(p.purchase_cost_ars)}</strong><span>Por {p.original_presentation.toLowerCase()}{p.tax_source?.startsWith('Con IVA')?' · con IVA en origen':''}</span></div>
        <div className={styles.cell}><small>Precio bulto</small><strong>{cents(offerOf(p,'pack')?.price_cents)}</strong></div>
        <div className={styles.cell}><small>Precio individual</small><strong>{cents(offerOf(p,'unit')?.price_cents)}</strong><span>Costo base: {p.purchase_cost_ars!=null?cash(p.purchase_cost_ars/Number(p.pack_base_qty)):'—'} / {p.base_unit}</span></div>
        <button className={styles.editButton} onClick={()=>enterEdit(p)}>Editar <ChevronRight size={16}/></button>
       </div>)}
       {!visible.length&&<div className={styles.empty}>No hay artículos para esos filtros.</div>}
      </div>
     </div>
     <section className={styles.bulk}><div><span className={styles.eyebrow}>ACTUALIZACIÓN MASIVA</span><h2>Aumentos o rebajas porcentuales</h2><p>Elegí artículos con las casillas. La modificación se aplicará solamente al valor seleccionado.</p></div><div className={styles.segmented}><button className={mode==='cost'?styles.active:''} onClick={()=>{setMode('cost');setFromCost(false)}}>Costos</button><button className={mode==='pack'?styles.active:''} onClick={()=>setMode('pack')}>Precio bulto</button><button className={mode==='unit'?styles.active:''} onClick={()=>setMode('unit')}>Precio individual</button></div>{mode!=='cost'&&<label className={styles.checkbox} style={{marginBottom:14}}><input type="checkbox" checked={fromCost} onChange={e=>{setFromCost(e.target.checked);if(e.target.checked)setDirection('up')}}/> Definir precios nuevos desde costo + recargo %</label>}<div className={styles.bulkControls}><div className={styles.segmented}><button disabled={fromCost} className={direction==='up'?styles.active:''} onClick={()=>setDirection('up')}><Plus size={16}/> Aumentar</button><button disabled={fromCost} className={direction==='down'?styles.active:''} onClick={()=>setDirection('down')}><Minus size={16}/> Reducir</button></div><label className={styles.pct}><Percent size={16}/><input type="number" aria-label="Porcentaje" min="0.01" max="1000" step="0.01" value={pctStr} onChange={e=>setPctStr(e.target.value)}/></label><button className={styles.primary} disabled={!filteredSelected||signedPct===null||signedPct<=-100||signedPct>1000} onClick={()=>{setBulkKey(crypto.randomUUID());setConfirm(true)}}>Previsualizar {selected.length} SKU <ArrowRight size={16}/></button></div><p className={styles.fineprint}>Los ajustes sobre precios existentes no crean nuevos precios. Para cargarlos por primera vez elegí «Desde costo + recargo». Costo y precio público son independientes; no altera pedidos anteriores. Revisá IVA en productos marcados «con IVA» en el PDF.</p></section>
     {historyOpen&&<section className={styles.history}><h2>Últimas modificaciones</h2>{changes.length?changes.map(h=><div key={h.id}><time>{new Date(h.created_at).toLocaleString('es-AR')}</time><code>{h.sku_snapshot}</code><span>{h.target==='cost'?'Costo':h.presentation_snapshot==='pack'?'P. bulto':'P. unidad'}</span><span>{h.target==='cost'?cash(h.old_value):cents(h.old_value)} → <b>{h.target==='cost'?cash(h.new_value):cents(h.new_value)}</b></span></div>):<p>Sin modificaciones registradas.</p>}</section>}
    </>}
   </div>
  </main>
  {isEditable&&editId&&current&&<div className={styles.backdrop} onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setEditId(null)}}><section role="dialog" aria-modal="true" aria-labelledby="edit-title" className={styles.modal}><div className={styles.modalHead}><div><span className={styles.eyebrow}>EDICIÓN INDIVIDUAL</span><h2 id="edit-title">{current.name}</h2><p><code>{current.sku}</code> · {current.brand}</p></div><button onClick={()=>setEditId(null)} disabled={busy} aria-label="Cerrar"><X/></button></div><div className={styles.formGrid}><label>Costo de compra <small>Por {current.original_presentation}</small><input type="number" min="0" step="0.01" value={draft.cost} onChange={e=>{setDraft({...draft,cost:e.target.value});setManualKey(crypto.randomUUID())}}/><small>Original: {cash(current.original_purchase_cost_ars)}</small></label><label>Precio al público — Bulto <small>Por {offerOf(current,'pack')?.unit_label||current.original_presentation}</small><input type="number" min="0.01" step="0.01" placeholder="Sin cargar" value={draft.pack} onChange={e=>{setDraft({...draft,pack:e.target.value});setManualKey(crypto.randomUUID())}}/></label><label>Precio al público — Individual <small>Por {offerOf(current,'unit')?.unit_label||current.base_unit}</small><input type="number" min="0.01" step="0.01" placeholder="Sin cargar" value={draft.unit} onChange={e=>{setDraft({...draft,unit:e.target.value});setManualKey(crypto.randomUUID())}}/></label></div><div className={styles.hint}><ShieldCheck size={17}/> Un mismo SKU para ambos formatos. La tienda lee estos precios cuando la oferta está habilitada y tiene stock disponible.</div><div className={styles.modalFooter}><button className={styles.secondary} onClick={()=>setEditId(null)} disabled={busy}>Cancelar</button><button className={styles.primary} onClick={save} disabled={busy}>{busy?'Guardando…':'Guardar cambios'} <Check size={16}/></button></div></section></div>}
  {isEditable&&confirm&&<div className={styles.backdrop} onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setConfirm(false)}}><section role="dialog" aria-modal="true" aria-labelledby="bulk-title" className={styles.modal}><div className={styles.modalHead}><div><span className={styles.eyebrow}>CONFIRMAR ACTUALIZACIÓN</span><h2 id="bulk-title">{fromCost?'Costo + ':signedPct!==null&&signedPct>0?'+':''}{signedPct}% en {mode==='cost'?'costos':mode==='pack'?'precios de bulto':'precios individuales'}</h2><p>{preview.length} registros seleccionados · {changeable} cambiarán · {skipped} sin base para calcular</p></div><button onClick={()=>setConfirm(false)} disabled={busy} aria-label="Cerrar"><X/></button></div><div className={styles.previewRows}>{preview.slice(0,35).map(({p,old,next,isCents,offer},i)=><div key={`${p.id}${offer?.id||''}${i}`}><code>{p.sku}</code><span>{isCents?cents(old):cash(old)} <ArrowRight size={14}/> <strong>{isCents?cents(next):cash(next)}</strong></span></div>)}{preview.length>35&&<small>+ {preview.length-35} registros adicionales</small>}</div><label className={styles.note}>Observación (opcional)<input maxLength={300} value={note} onChange={e=>setNote(e.target.value)} placeholder="Ej. Actualización proveedor noviembre"/></label><div className={styles.modalFooter}><button className={styles.secondary} onClick={()=>setConfirm(false)} disabled={busy}>Cancelar</button><button className={styles.primary} disabled={busy||!changeable||signedPct===null||signedPct<=-100||signedPct>1000} onClick={applyBulk}>{busy?'Aplicando…':`Confirmar ${changeable} cambios`} <Check size={16}/></button></div></section></div>}
 </div>;
}
