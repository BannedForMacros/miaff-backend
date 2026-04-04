# MIAFF Backend — Contexto para Claude

## Rutas del proyecto
- **Backend:** `/home/bannedformacros/Proyectos/miaff-backend`
- **Frontend:** `/home/bannedformacros/Proyectos/miaff-fronted` (typo intencional en el nombre)
- **Servidor producción:** `/var/www/html/miaff` — deploy con `npm run build && pm2 restart miaff`

## Stack
- Node.js + TypeScript + Express — puerto 3000
- PostgreSQL schema: `miaff`
- URL producción: `https://miaff.gestvenin.com/`

## Variables de entorno relevantes (.env)
- `EXPO_PUBLIC_DECOLECTA_TOKEN` — API key de Decolecta para tipo de cambio SBS
  - **Estado actual: expirada/límite excedido (401).** Usuario gestionando renovación.

## Tipo de cambio (`src/services/exchangeRate.service.ts`)
Flujo: caché memoria → tabla `miaff.exchange_rates` → API Decolecta → **fallback: último T/C en BD**
- Fallback añadido para cubrir fines de semana, feriados y caídas de Decolecta.
- Ruta `GET /api/exchange-rate` es **pública** (sin requireAuth).

## Módulo importaciones/compras nacionales — cambios recientes

### BD: sin cambios de schema
`habilitar_igv` ya existía en `miaff.importaciones`. Solo se corrigió lógica.

### Backend `src/services/importacion.service.ts`
- `calcularCompraNacional`: antes siempre calculaba IGV ignorando `habilitar_igv`.
  Fix: `montoIGV = data.habilitar_igv ? round2(monto * tasa) : 0`

### Frontend formularios (`ImportacionFormScreen.tsx`, `EditImportacionScreen.tsx`)
- Label `"Monto de Compra"` → `"Valor Compra"` (valor sin IGV)
- Nuevo switch `"¿Gravada con IGV?"` solo visible en compras nacionales (`gravadaIgv`, default `true`)
- Payload: `habilitar_igv: esCompraNacional ? gravadaIgv : true`

### Frontend reporte (`ImportacionResultScreen.tsx`)
- Label `"Monto de Compra"` → `"Valor Compra"`
- Badge en header: "Gravada con IGV" (amarillo) o "No gravada / Exonerada" (verde)
- Si no gravada: muestra "IGV/IPM — No aplica"
- `rowValue`: `flexShrink: 1` + `maxWidth: '55%'` para evitar texto superpuesto
- Cuenta + nombre mercancía en una línea: `"601 – Mercaderías"`

## Timezone — bug corregido
Servidor en UTC, Perú UTC-5. Fechas creadas después de las 7pm aparecían con fecha del día siguiente.
- **`src/utils/dateUtils.ts` → `formatDateDisplay`**: si el string tiene `T` o `Z`, convierte con `toLocaleDateString('es-PE', { timeZone: 'America/Lima' })`. Si es solo `YYYY-MM-DD`, procesa directo.
- `ImportacionHomeScreen.tsx` → `formatearFecha`: mismo fix local.

## Simulador DTA (`SimAduResultScreen.tsx`)
Botón PDF ahora muestra Alert con opciones:
- **Vista previa** → `Print.printAsync({ html })`
- **Compartir** → `printToFileAsync` + `Sharing.shareAsync`

## Simulador financiero (`src/services/analisis.service.ts`)
- Requiere T/C al inicio. Falla 500 si no hay T/C disponible → solucionar con deploy del fallback.
- No requirió cambios por el fix de IGV en compras nacionales (usa `valor_cif` como base, correcto).
