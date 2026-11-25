'use client';
import {useState} from 'react';
import css from './jc-brand.module.css';

/** Un único recurso para toda la plataforma: public/jc-logo.png.
 * Si el archivo todavía no fue subido, se mantiene el nombre JC actual.
 * No se redibuja ni manipula el logo original. */
export default function JcBrand({mode='light',className=''}:{mode?:'light'|'dark',className?:string}){
 const [imageReady,setImageReady]=useState(true);
 return <span className={`${css.root} ${mode==='dark'?css.dark:''} ${className}`}>
   {imageReady
    ? <img src="/jc-logo.png" alt="JC Soluciones Descartables" width={210} height={58} onError={()=>setImageReady(false)}/>
    : <span className={css.fallback}><span className={css.wordline}>JC<i>.</i></span><small>SOLUCIONES DESCARTABLES</small></span>}
 </span>;
}
