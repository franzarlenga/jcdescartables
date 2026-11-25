'use client';
import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,ChevronDown,ChevronRight,Filter,Menu,Minus,Package,Plus,Search,ShieldCheck,ShoppingBag,SlidersHorizontal,Trash2,Truck,WalletCards,X} from 'lucide-react';
import type {CartLine,Group,Offer} from '@/lib/types';
import {money} from '@/lib/types';
import {type HomeContent} from '@/lib/home';
import {JC_BUSINESS} from '@/lib/jc-business';
import JcBrand from '@/components/jc-brand';

type Props={groups:Group[],error:string,homeContent:HomeContent};
const cartKey='jc-tienda-cart-v1';
const HOME_ROOTS=['Bandejas y envases','Rollos de arranque','Bolsas camiseta','Bolsas','Film, láminas y aluminio','Papel y limpieza','Descartables y varios'];
function imageUrl(path:string|null){
 if(!path)return '';
 const base=process.env.NEXT_PUBLIC_SUPABASE_URL||'';
 return `${base.replace(/\/$/,'')}/storage/v1/object/public/jc-product-images/${path.split('/').map(encodeURIComponent).join('/')}`;
}
function normalized(t:string){return t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
function Quantity({value,setValue,min=1,max=9999}: {value:number;setValue:(n:number)=>void;min?:number;max?:number}){
 const bounded=(n:number)=>setValue(Math.max(min,Math.min(max,Math.floor(Number.isFinite(n)?n:min))));
 return <div className="jc-stepper"><button type="button" aria-label="Restar una unidad" disabled={value<=min} onClick={()=>bounded(value-1)}><Minus size={17}/></button><input aria-label="Cantidad" type="number" min={min} max={max} inputMode="numeric" value={value} onChange={e=>bounded(Number(e.target.value))}/><button type="button" aria-label="Sumar una unidad" disabled={value>=max} onClick={()=>bounded(value+1)}><Plus size={17}/></button></div>;
}
export default function Store({groups,error,homeContent}:Props){
 const [search,setSearch]=useState('');
 const [catalogAll,setCatalogAll]=useState(false);
 const [department,setDepartment]=useState('Todas');
 const [family,setFamily]=useState('Todas');
 const [brand,setBrand]=useState('Todas');
 const [sort,setSort]=useState<'relevance'|'price_asc'|'price_desc'|'name'>('relevance');
 const [filtersOpen,setFiltersOpen]=useState(false);
 const [menuOpen,setMenuOpen]=useState(false);
 const [opened,setOpened]=useState<Group|null>(null);
 const [sku,setSku]=useState('');
 const [presentation,setPresentation]=useState<'unit'|'pack'>('pack');
 const [qty,setQty]=useState(1);
 const [cart,setCart]=useState<CartLine[]>([]);
 const [cartLoaded,setCartLoaded]=useState(false);
 const [cartOpen,setCartOpen]=useState(false);
 const [checkout,setCheckout]=useState(false);
 const [sending,setSending]=useState(false);
 const [message,setMessage]=useState('');
 const [clientKey,setClientKey]=useState('');
 const [buyer,setBuyer]=useState({name:'',email:'',phone:'',address:'',notes:''});
 useEffect(()=>{try{const s=JSON.parse(localStorage.getItem(cartKey)||'[]');if(Array.isArray(s))setCart(s);}catch{}setCartLoaded(true);},[]);
 useEffect(()=>{if(cartLoaded)try{localStorage.setItem(cartKey,JSON.stringify(cart));}catch{}},[cart,cartLoaded]);
 const departments=useMemo(()=>[...new Set([...HOME_ROOTS,...groups.map(g=>g.department_name||'Otros')])],[groups]);
 const families=useMemo(()=>[...new Set(groups.filter(g=>department==='Todas'||(g.department_name||'Otros')===department).map(g=>g.category_name||g.family))].sort((a,b)=>a.localeCompare(b,'es')),[groups,department]);
 const brands=useMemo(()=>[...new Set(groups.filter(g=>(department==='Todas'||(g.department_name||'Otros')===department)&&(family==='Todas'||(g.category_name||g.family)===family)).map(g=>g.brand))].sort((a,b)=>a.localeCompare(b,'es')),[groups,department,family]);
 const filtered=useMemo(()=>{
   const result=groups.filter(g=>
    (department==='Todas'||(g.department_name||'Otros')===department)&&
    (family==='Todas'||(g.category_name||g.family)===family)&&
    (brand==='Todas'||g.brand===brand)&&
    normalized([g.title,g.brand,g.family,...g.offers.map(o=>`${o.sku} ${o.variant_name}`)].join(' ')).includes(normalized(search)));
   if(sort==='name')result.sort((a,b)=>a.title.localeCompare(b.title,'es'));
   if(sort==='price_asc')result.sort((a,b)=>Math.min(...a.offers.map(o=>o.price_cents))-Math.min(...b.offers.map(o=>o.price_cents)));
   if(sort==='price_desc')result.sort((a,b)=>Math.min(...b.offers.map(o=>o.price_cents))-Math.min(...a.offers.map(o=>o.price_cents)));
   return result;
 },[groups,department,family,brand,search,sort]);
 const homePreview=!catalogAll&&!search&&department==='Todas'&&family==='Todas'&&brand==='Todas';
 const shownGroups=homePreview?filtered.slice(0,9):filtered;
 const featuredDepartments=useMemo(()=>departments.map(d=>({name:d,count:groups.filter(g=>(g.department_name||'Otros')===d).length, families:new Set(groups.filter(g=>(g.department_name||'Otros')===d).map(g=>g.category_name||g.family)).size})),[departments,groups]);
 const variantItems=useMemo(()=>{
  const map=new Map<string,{sku:string,name:string,offers:Offer[]}>();
  for(const offer of opened?.offers||[]){if(!map.has(offer.sku))map.set(offer.sku,{sku:offer.sku,name:offer.variant_name,offers:[]});map.get(offer.sku)!.offers.push(offer);}
  return [...map.values()];
 },[opened]);
 const chosenVariant=variantItems.find(v=>v.sku===sku)||variantItems[0];
 const chosenOffer=chosenVariant?.offers.find(o=>o.presentation===presentation)||chosenVariant?.offers[0];
 const cartCount=cart.reduce((a,l)=>a+l.qty,0);
 const subtotal=cart.reduce((a,l)=>a+l.qty*l.price_cents,0);
 function jumpTo(id:string){document.getElementById(id)?.scrollIntoView({behavior:'smooth'});}
 function filterBrand(b:string){setCatalogAll(true);setSearch('');setDepartment('Todas');setFamily('Todas');setBrand(b);jumpTo('catalogo');}
 function filterFamily(f:string){setCatalogAll(true);setDepartment('Todas');setFamily(f);setBrand('Todas');setSearch('');jumpTo('catalogo');}
 function selectDepartment(d:string){setCatalogAll(true);setDepartment(d);setFamily('Todas');setBrand('Todas');setMenuOpen(false);setFiltersOpen(false);document.getElementById('catalogo')?.scrollIntoView({behavior:'smooth'});}
 function selectFamily(f:string){setFamily(f);setBrand('Todas');setFiltersOpen(false);}
 function resetAll(){setDepartment('Todas');setFamily('Todas');setBrand('Todas');setSearch('');setSort('relevance');}
 function openGroup(g:Group){setOpened(g);setSku(g.offers[0]?.sku||'');setPresentation('pack');setQty(1);setMessage('');}
 function selectSku(code:string){setSku(code);setPresentation('pack');setQty(1);}
 function addToCart(){
  if(!opened||!chosenOffer)return;
  if(chosenOffer.available_qty<qty){setMessage('No hay suficientes unidades disponibles.');return;}
  const alreadyBase=cart.filter(c=>c.sku===chosenOffer.sku).reduce((a,c)=>{
    const offer=opened.offers.find(o=>o.offer_id===c.offer_id);
    return a+(offer?offer.units_base*c.qty:0);
  },0);
  const capacity=opened.offers.find(o=>o.sku===chosenOffer.sku && o.presentation==='unit')?.available_qty||chosenOffer.available_qty*chosenOffer.units_base;
  if(alreadyBase+qty*chosenOffer.units_base>capacity){setMessage('La cantidad total de bultos y unidades supera el disponible.');return;}
  setCart(current=>{
   const existing=current.find(l=>l.offer_id===chosenOffer.offer_id);
   const other=current.filter(l=>l.offer_id!==chosenOffer.offer_id);
   return [...other,{offer_id:chosenOffer.offer_id,sku:chosenOffer.sku,title:opened.title,variant_name:chosenOffer.variant_name,unit_label:chosenOffer.unit_label,qty:qty+(existing?.qty||0),price_cents:chosenOffer.price_cents,available_qty:chosenOffer.available_qty}];
  });setOpened(null);setCartOpen(true);
 }
 function updateQty(id:string,n:number){setCart(c=>c.map(l=>l.offer_id===id?{...l,qty:Math.max(1,Math.min(l.available_qty,n))}:l));}
 async function pay(e:React.FormEvent){
  e.preventDefault();setSending(true);setMessage('');
  const key=clientKey||crypto.randomUUID();setClientKey(key);
  try{
    const res=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_key:key,buyer,lines:cart.map(l=>({offer_id:l.offer_id,qty:l.qty}))})});
    const result=await res.json();if(!res.ok)throw new Error(result.error||'No se pudo iniciar el pago');if(!result.checkout_url)throw new Error('No se recibió enlace de pago');
    window.location.assign(result.checkout_url);
  }catch(e){setMessage(e instanceof Error?e.message:'No se pudo completar la solicitud.');setClientKey('');setSending(false);}
 }
 return <div className="jc-shop-v2">
  <div className="jc-service-strip"><span><ShieldCheck size={14}/> Compra sin registro</span><span><WalletCards size={14}/> Medios de pago y cuotas en Mercado Pago</span><span><Truck size={14}/> Entregas a coordinar</span></div>
  <header className="jc-header"><div className="jc-header-inner">
   <a href="/" className="jc-brand-link" aria-label="JC Soluciones Descartables"><JcBrand /></a>
   <nav className="jc-primary-nav"><button onClick={()=>selectDepartment('Todas')}>Catálogo</button>{departments.slice(0,4).map(d=><button onClick={()=>selectDepartment(d)} key={d}>{d}</button>)}</nav>
   <div className="jc-header-actions"><button className="jc-icon-mobile" aria-label="Menú" onClick={()=>setMenuOpen(v=>!v)}><Menu size={22}/></button><button className="jc-cart-action" aria-label="Abrir carrito" onClick={()=>setCartOpen(true)}><ShoppingBag size={20}/><span>Carrito</span><b>{cartCount}</b></button></div>
  </div>{menuOpen&&<div className="jc-mobile-menu"><button onClick={()=>selectDepartment('Todas')}>Todas las categorías</button>{departments.map(d=><button onClick={()=>selectDepartment(d)} key={d}>{d}<ChevronRight size={16}/></button>)}</div>}</header>
  <main>
   <div className="jc-home-notice" aria-label="Opciones de compra"><span>✓ Venta por unidad y por bulto</span><span>✓ Elegí medidas y presentaciones</span><span>✓ Compra sin registrarte</span></div>
   <section className="jc-hero-v2 jc-home-hero"><div className="jc-hero-copy"><span className="jc-kicker">JC · SOLUCIONES DESCARTABLES</span><h1>{homeContent.heroTitle}</h1><p>{homeContent.heroText}</p><div className="jc-home-hero-buttons"><button className="jc-btn-primary" onClick={()=>selectDepartment('Todas')}>Comprar por categoría <ArrowRight size={18}/></button><button className="jc-home-outline" onClick={()=>jumpTo('como-comprar')}>Cómo comprar</button></div><div className="jc-hero-proof"><span><Check size={16}/> Productos para comercios</span><span><Check size={16}/> Por marca y medida</span></div></div><div className="jc-hero-visual jc-home-visual" aria-hidden="true"><div className="jc-home-visual-label">TU NEGOCIO, BIEN ABASTECIDO.</div><div className="jc-home-pack jc-home-pack-one"><b>BOLSAS</b><small>Arranque · Camiseta</small><i>JC.</i></div><div className="jc-home-pack jc-home-pack-two"><b>ENVASES</b><small>Bandejas · Potes</small><i>JC.</i></div><div className="jc-home-pack jc-home-pack-three"><b>PAPEL</b><small>Higiene · Cocina</small><i>JC.</i></div><div className="jc-home-visual-foot">ENVASES · BOLSAS · PAPEL · DESCARTABLES</div></div></section>
   <section className="jc-home-highlights" aria-label="Beneficios de compra">{[['01','Elegí por rubro','Categorías y subcategorías'],['02','Medidas y variantes','Encontrá la opción exacta'],['03','Bulto o individual','Comprá según tu necesidad'],['04','Sin registro','Carrito y compra como invitado']].map(([i,t,d])=><div key={i}><span>{i}</span><p><b>{t}</b><small>{d}</small></p></div>)}</section>
   <section className="jc-categories-section" aria-label="Categorías"><div className="jc-heading-row"><div><span className="jc-kicker">NAVEGÁ POR RUBRO</span><h2>Comprá por categoría</h2></div><button className="jc-text-action" onClick={()=>selectDepartment('Todas')}>Ver todo <ArrowRight size={17}/></button></div><div className="jc-categories-grid">{featuredDepartments.map((d,i)=><button key={d.name} className="jc-category-card" onClick={()=>selectDepartment(d.name)}><span className="jc-category-num">0{i+1}</span><span className="jc-category-icon"><Package size={25} strokeWidth={1.6}/></span><b>{d.name}</b><small>{d.families} {d.families===1?'subcategoría':'subcategorías'} · {d.count} {d.count===1?'producto':'productos'}</small><ChevronRight size={17} className="jc-cat-arrow"/></button>)}</div>{!featuredDepartments.length&&<div className="jc-info-box">La tienda quedará lista cuando se conecte Supabase y se habiliten artículos con precio y stock. Las 337 referencias están preparadas en el módulo privado.</div>}</section>
   <section className="jc-home-feature"><article className="jc-home-feature-primary"><span className="jc-kicker">COMPRA COMERCIAL</span><h2>{homeContent.bannerTitle}</h2><p>{homeContent.bannerText}</p><button onClick={()=>selectDepartment('Todas')}>Recorrer el catálogo ↗</button><div className="jc-home-feature-abstract">JC</div></article><article className="jc-home-feature-secondary"><span className="jc-kicker">ENCONTRÁ LO TUYO</span><h3>Todo para gastronomía y comercios.</h3><p>Envases, bolsas y artículos para el día a día.</p><button onClick={()=>selectDepartment('Bandejas y envases')}>Ver envases ↗</button></article></section>
   <section className="jc-home-lines"><div className="jc-heading-row"><div><span className="jc-kicker">MARCAS Y LÍNEAS</span><h2>Encontrá lo que buscás.</h2><p>Elegí una línea conocida y explorá sus medidas y presentaciones.</p></div><button className="jc-text-action" onClick={()=>selectDepartment('Todas')}>Explorar todo <ArrowRight size={17}/></button></div><div className="jc-home-line-grid"><button onClick={()=>filterBrand('Rolan')}><span>01 / BOLSAS</span><b>Rolan</b><small>Rollos de arranque · varias medidas</small><i>↗</i></button><button onClick={()=>filterBrand('Elegante')}><span>02 / PAPEL</span><b>Elegante</b><small>Higiénico, cocina y bobinas</small><i>↗</i></button><button onClick={()=>filterFamily('Film')}><span>03 / EMBALAJE</span><b>Film PVC</b><small>Rollos, anchos y longitudes</small><i>↗</i></button><button onClick={()=>selectDepartment('Bandejas y envases')}><span>04 / GASTRONOMÍA</span><b>Bandejas y envases</b><small>Distintos materiales y modelos</small><i>↗</i></button></div></section>
   <section className="jc-home-sectors"><div className="jc-heading-row"><div><span className="jc-kicker">SOLUCIONES POR ACTIVIDAD</span><h2>Para tu tipo de comercio.</h2><p>Un acceso más rápido a los artículos de cada rubro.</p></div></div><div className="jc-home-sector-grid">{[['◒','Gastronomía','Envases, bandejas, vasos y tapas','Bandejas y envases'],['▣','Almacenes y comercios','Bolsas, rollos y embalaje','Bolsas'],['▥','Embalaje y despacho','Film, láminas y accesorios','Film, láminas y aluminio'],['▤','Higiene y papel','Papel higiénico, cocina y servilletas','Papel y limpieza']].map(([symbol,title,description,dept])=><button key={title} onClick={()=>selectDepartment(dept)}><div className="jc-home-sector-icon">{symbol}</div><b>{title}</b><small>{description}</small><span>Ver soluciones ↗</span></button>)}</div></section>
   <section className="jc-home-wholesale" id="por-mayor"><div><span className="jc-kicker">COMPRÁ COMO NECESITÁS</span><h2>{homeContent.wholesaleTitle}</h2><p>{homeContent.wholesaleText}</p><button className="jc-btn-primary" onClick={()=>selectDepartment('Todas')}>Ver productos y presentaciones <ArrowRight size={17}/></button></div><div className="jc-home-wholesale-options"><div><span>01</span><b>Unidad individual</b><small>Seleccioná la unidad de venta disponible de cada referencia.</small></div><div><span>02</span><b>Bulto cerrado</b><small>Consultá cuántas unidades contiene el bulto antes de comprar.</small></div><div className="jc-home-wholesale-note">Elegí la presentación que necesites: individual o bulto cerrado.</div></div></section>
   <section id="catalogo" className="jc-catalog-v2"><div className="jc-heading-row jc-catalog-heading"><div><span className="jc-kicker">CATÁLOGO ONLINE</span><h2>{homePreview?'Una selección del catálogo':department==='Todas'?'Todos los productos':department}</h2><p>Elegí categoría, marca y presentación. Consultá las presentaciones disponibles antes de comprar.</p></div><span className="jc-results-count">{filtered.length} {filtered.length===1?'grupo comercial':'grupos comerciales'}</span></div>
    <div className="jc-catalog-search"><Search size={19}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nombre, marca, medida o SKU" aria-label="Buscar productos"/>{search&&<button aria-label="Limpiar búsqueda" onClick={()=>setSearch('')}><X size={17}/></button>}</div>
    <div className="jc-catalog-grid"><aside className={'jc-filters '+(filtersOpen?'visible':'')}><div className="jc-filters-head"><b>Filtros</b><button onClick={resetAll}>Limpiar</button></div><div className="jc-filter-unit"><h3>Categorías</h3><button className={department==='Todas'?'active':''} onClick={()=>selectDepartment('Todas')}>Todos los productos <span>{groups.length}</span></button>{departments.map(d=><button className={department===d?'active':''} onClick={()=>selectDepartment(d)} key={d}>{d}<ChevronRight size={14}/></button>)}</div>{families.length>0&&<div className="jc-filter-unit"><h3>Subcategorías</h3><button className={family==='Todas'?'active':''} onClick={()=>selectFamily('Todas')}>Todas</button>{families.map(f=><button key={f} className={family===f?'active':''} onClick={()=>selectFamily(f)}>{f}</button>)}</div>}{brands.length>0&&<div className="jc-filter-unit"><h3>Marcas</h3><button className={brand==='Todas'?'active':''} onClick={()=>setBrand('Todas')}>Todas las marcas</button>{brands.map(b=><button className={brand===b?'active':''} onClick={()=>setBrand(b)} key={b}>{b}</button>)}</div>}</aside>
     <div className="jc-catalog-main"><div className="jc-toolbar"><div><button className="jc-mobile-filter" onClick={()=>setFiltersOpen(v=>!v)}><Filter size={17}/> Categorías y filtros <ChevronDown size={15}/></button><span>{filtered.length} resultados</span></div><label>Ordenar <select value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="relevance">Destacados</option><option value="name">Nombre</option><option value="price_asc">Menor precio</option><option value="price_desc">Mayor precio</option></select></label></div>
      {error&&<div className="jc-info-box">{error}</div>}
      {!filtered.length?<div className="jc-empty-results"><Package size={39} strokeWidth={1.5}/><h3>{search?'Sin coincidencias':'No hay artículos publicados todavía'}</h3><p>{search?'Probá con otra marca, familia o medida.':'Próximamente encontrarás productos disponibles para comprar.'}</p><button className="jc-outline-button" onClick={resetAll}>Ver todas las categorías</button></div>:
       <div className="jc-products-grid">{shownGroups.map(g=>{
        const first=Math.min(...g.offers.map(o=>o.price_cents));const img=imageUrl(g.image_path||g.offers.find(o=>o.image_path)?.image_path||null);const models=new Set(g.offers.map(o=>o.sku)).size;
        return <article key={g.id} className="jc-product-tile"><button type="button" className="jc-tile-image" aria-label={'Ver '+g.title} onClick={()=>openGroup(g)}>{img?<img alt={g.title} src={img}/>:<div className="jc-image-placeholder"><Package size={52} strokeWidth={1.25}/><small>{g.brand}</small></div>}</button><div className="jc-tile-body"><span>{g.category_name||g.family} / {g.brand}</span><h3>{g.title}</h3><p>{models} {models===1?'modelo disponible':'medidas o modelos disponibles'}</p><div className="jc-tile-bottom"><div><small>Desde</small><b>{money(first)}</b></div><button aria-label={'Elegir '+g.title} onClick={()=>openGroup(g)}><Plus size={21}/></button></div></div></article>;
       })}</div>}
      {homePreview&&filtered.length>9&&<div className="jc-home-view-all"><button className="jc-btn-primary" onClick={()=>{setCatalogAll(true);jumpTo('catalogo')}}>Ver catálogo completo ({filtered.length} grupos) <ArrowRight size={17}/></button></div>}
     </div>
    </div>
   </section>
   <section className="jc-how-v2" id="como-comprar"><div><span className="jc-kicker">COMPRÁ FÁCIL</span><h2>Simple, rápido y sin registrarte.</h2></div><div className="jc-how-cards"><div><b>01</b><h3>Elegí productos</h3><p>Buscá por rubro, marca o medida y seleccioná bulto o unidad.</p></div><div><b>02</b><h3>Completá tus datos</h3><p>Ingresá contacto y dirección al finalizar el carrito.</p></div><div><b>03</b><h3>Pagá de forma segura</h3><p>Las opciones de tarjetas y cuotas se muestran en Mercado Pago.</p></div></div></section>
   <section className="jc-home-faq"><div className="jc-home-faq-intro"><span className="jc-kicker">AYUDA PARA COMPRAR</span><h2>Preguntas frecuentes.</h2><p>Lo principal para comprar desde la tienda JC.</p></div><div className="jc-home-faq-items"><details><summary>¿Tengo que registrarme para comprar? <span>+</span></summary><p>No. Elegís productos y completás tus datos para finalizar el carrito.</p></details><details><summary>¿Puedo comprar por bulto y también individual? <span>+</span></summary><p>Sí, cuando ambas presentaciones estén habilitadas. La equivalencia del bulto figura en cada variante.</p></details><details><summary>¿Cómo se ofrecen las cuotas? <span>+</span></summary><p>Al habilitar Mercado Pago, verás los medios y cuotas disponibles según tu tarjeta y las condiciones vigentes.</p></details><details><summary>¿Cómo se coordina la entrega? <span>+</span></summary><p>Las condiciones y costos de entrega se confirmarán cuando se activen los envíos de la tienda.</p></details></div></section>
  </main>
  <footer className="jc-footer-v2 jc-home-footer"><div><a href="/" className="jc-brand-link" aria-label="JC Soluciones Descartables"><JcBrand mode="dark" /></a><p>Descartables y soluciones para comercios.</p></div><div><b>EXPLORÁ JC</b><button onClick={()=>selectDepartment('Todas')}>Catálogo completo</button><button onClick={()=>jumpTo('como-comprar')}>Cómo comprar</button><button onClick={()=>jumpTo('por-mayor')}>Unidad y bulto</button></div><div><b>CONTACTO JC</b><p>{JC_BUSINESS.address}</p><p>Teléfono: <a href={`tel:${JC_BUSINESS.phoneE164}`}>{JC_BUSINESS.phoneDisplay}</a></p><p>Entregas a coordinar. La dirección informada no confirma retiro presencial.</p></div></footer>
  {cartCount>0&&!cartOpen&&<button className="jc-floating-cart" onClick={()=>setCartOpen(true)}><ShoppingBag size={19}/> Ver carrito ({cartCount}) <b>{money(subtotal)}</b></button>}
  {opened&&<div className="jc-modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setOpened(null)}}><section className="jc-product-dialog" role="dialog" aria-modal="true" aria-label={'Elegir '+opened.title}>
   <header><div><span className="jc-kicker">DETALLE DEL PRODUCTO</span><h2>{opened.title}</h2><p>{opened.brand} · {opened.category_name||opened.family}</p></div><button aria-label="Cerrar" onClick={()=>setOpened(null)}><X size={22}/></button></header><div className="jc-dialog-scroll"><div className="jc-dialog-image">{opened.image_path||opened.offers.find(o=>o.image_path)?<img alt={opened.title} src={imageUrl(opened.image_path||opened.offers.find(o=>o.image_path)?.image_path||null)}/>:<Package size={65} strokeWidth={1}/>}</div>
    <div className="jc-dialog-field"><b>1 · Medida o modelo</b><div className="jc-variant-grid">{variantItems.map(v=><button key={v.sku} onClick={()=>selectSku(v.sku)} className={chosenVariant?.sku===v.sku?'selected':''}>{v.name}</button>)}</div></div>
    <div className="jc-dialog-field"><b>2 · Presentación</b><div className="jc-format-grid">{chosenVariant?.offers.map(o=><button key={o.offer_id} className={chosenOffer?.offer_id===o.offer_id?'selected':''} onClick={()=>{setPresentation(o.presentation);setQty(1)}}><strong>{o.presentation==='pack'?'Bulto cerrado':'Individual'}</strong><small>{o.unit_label}</small><b>{money(o.price_cents)}</b></button>)}</div></div>
    <div className="jc-dialog-field"><b>3 · Cantidad</b><div className="jc-dialog-quantity"><Quantity value={qty} setValue={setQty} max={Math.max(1,chosenOffer?.available_qty||1)}/><small>Disponible: {chosenOffer?.available_qty||0}</small></div></div>
   </div><footer>{message&&<p className="jc-error">{message}</p>}<div><small>Subtotal</small><strong>{money((chosenOffer?.price_cents||0)*qty)}</strong></div><button className="jc-btn-primary" disabled={!chosenOffer||chosenOffer.available_qty<qty} onClick={addToCart}>Agregar al carrito <ArrowRight size={18}/></button></footer>
  </section></div>}
  {cartOpen&&<div className="jc-modal-overlay jc-drawer-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setCartOpen(false)}}><aside className="jc-cart-drawer" role="dialog" aria-modal="true" aria-label="Carrito"><header><div><span className="jc-kicker">TU COMPRA</span><h2>{checkout?'Finalizar compra':'Mi carrito'} <small>({cartCount})</small></h2></div><button aria-label="Cerrar carrito" onClick={()=>{setCartOpen(false);setCheckout(false);setMessage('')}}><X size={22}/></button></header>
   {!checkout?<><div className="jc-cart-lines">{cart.length===0?<div className="jc-empty-results"><ShoppingBag size={30}/><p>Tu carrito está vacío.</p></div>:cart.map(l=><div className="jc-cart-line" key={l.offer_id}><div><b>{l.title}</b><p>{l.variant_name} · {l.unit_label}</p><small>{l.sku}</small></div><button aria-label="Quitar producto" onClick={()=>setCart(c=>c.filter(x=>x.offer_id!==l.offer_id))}><Trash2 size={17}/></button><div className="jc-cart-line-bottom"><Quantity value={l.qty} setValue={n=>updateQty(l.offer_id,n)} max={l.available_qty}/><strong>{money(l.qty*l.price_cents)}</strong></div></div>)}</div><footer><div className="jc-cart-total"><span>Subtotal</span><b>{money(subtotal)}</b></div><p>La entrega se coordina aparte; aún no se suma un costo de envío.</p><button className="jc-btn-primary" disabled={cart.length===0} onClick={()=>{setCheckout(true);setMessage('');setClientKey('')}}>Continuar <ArrowRight size={18}/></button></footer></>:
   <form className="jc-checkout-form" onSubmit={pay}><button type="button" className="jc-back-link" onClick={()=>setCheckout(false)}><ArrowLeft size={16}/> Volver al carrito</button><h3>Datos para la compra</h3><p>Comprás como invitado. El pago se realiza en Mercado Pago.</p><label>Nombre y apellido<input required minLength={3} value={buyer.name} onChange={e=>setBuyer({...buyer,name:e.target.value})}/></label><label>Correo electrónico<input type="email" required value={buyer.email} onChange={e=>setBuyer({...buyer,email:e.target.value})}/></label><label>Teléfono<input required type="tel" value={buyer.phone} onChange={e=>setBuyer({...buyer,phone:e.target.value})}/></label><label>Dirección de entrega<input required minLength={5} value={buyer.address} onChange={e=>setBuyer({...buyer,address:e.target.value})}/></label><label>Observaciones (opcional)<textarea rows={2} maxLength={500} value={buyer.notes} onChange={e=>setBuyer({...buyer,notes:e.target.value})}/></label><div className="jc-cart-total"><span>Total de productos</span><b>{money(subtotal)}</b></div><p>Las cuotas dependen de Mercado Pago. El envío no está incluido.</p>{message&&<p className="jc-error">{message}</p>}<button className="jc-btn-primary" type="submit" disabled={sending}>{sending?'Conectando...':'Ir a pagar con Mercado Pago'} <ArrowRight size={18}/></button></form>}
  </aside></div>}
 </div>;
}
