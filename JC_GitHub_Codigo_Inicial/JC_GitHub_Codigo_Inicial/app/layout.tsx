import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = {title: 'JC | Soluciones Descartables', description: 'Catálogo y tienda de JC Soluciones Descartables', icons: {icon: [{url:'/jc-logo.png', type:'image/png'}], shortcut: '/jc-logo.png', apple: '/jc-logo.png'}};
export default function RootLayout({children}: {children: React.ReactNode}) { return <html lang="es-AR"><body>{children}</body></html>; }
