# ✨ Gasty Mobile — Guía de Diseño Visual Minimalista & Motion System (60fps)

> **Inspiración Principal:** [60fps.design/motion](https://60fps.design/motion) — *Crafted micro-interactions, spring physics, fluid layout morphing & tactile minimalism.*  
> **Usuarios:** Jhon & Sol (Uso privado en pareja)  
> **Stack Visual en `movil-app-gasty`:** `react-native-reanimated` v4.5 + `react-native-gesture-handler` + `expo-glass-effect` + `expo-image`

---

## 1. Filosofía de Diseño: *"Quiet Luxury & Tactile Motion"*

En lugar de parecer un folleto saturado de supermercado lleno de banners rojos y amarillos, **Gasty** se siente como las mejores apps de [60fps.design/motion](https://60fps.design/motion) (**Family, Linear Mobile, Arc Search, Apple Journal**):

1. **Silencio Visual (Minimalismo Funcional):**
   - Fondos limpios en tonos piedra/obsidiana, sin bordes pesados ni sombras sucias.
   - Las **fotos reales de los productos** (sobre pastillas blancas redondeadas de `48x48px`) y las **etiquetas de Jhon (🟦) y Sol (🟪)** son los únicos toques de color junto con el verde esmeralda del **Súper Ganador**.
2. **Todo Responde al Tacto (Física de Resortes, Cero Curvas Lineales):**
   - Ningún elemento aparece o desaparece de golpe. Todo utiliza **física de resortes (`withSpring`)** sin rebotes exagerados (*critically damped springs*).
   - Los números de precios y subtotales usan tipografía monoespaciada tabular (`fontVariant: ['tabular-nums']`) con transición tipo **odómetro / rolling ticker** cuando subes cantidades o tachas productos en el pasillo.
3. **Uso con Una Sola Mano (Thumb-Zone First):**
   - Cuando estás empujando el carrito en La Sirena, Nacional o Jumbo, el pulgar descansa en la parte inferior. Por eso la barra de búsqueda y el resumen del carrito viven en una **Isla Flotante Inferior (*Floating Glass Bar*)** con efecto cristal (`expo-glass-effect`).

---

## 2. Sistema de Color y Tipografía Minimalista

### 🎨 Paleta de Colores (Modo Claro & Modo Oscuro Puro)

| Token | Modo Claro (*Warm Alabaster*) | Modo Oscuro (*OLED Obsidian*) | Uso en la Interfaz |
| :--- | :--- | :--- | :--- |
| `background` | `#F8F8FA` | `#09090B` | Lienzo principal ultra limpio |
| `surfaceCard` | `#FFFFFF` | `#121215` | Tarjetas de producto e islas |
| `surfaceGlass` | `rgba(255,255,255,0.78)` | `rgba(24,24,28,0.75)` | Isla flotante inferior y barra superior con blur |
| `borderHairline` | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.07)` | Bordes sutiles de `1px` |
| `textPrimary` | `#111113` | `#FAFAFA` | Títulos, nombres de producto y precios |
| `textSecondary` | `#71717A` | `#A1A1AA` | Unidades (`10 lb`, `315g`), notas y metadatos |
| `accentJhon` | `#0A84FF` | `#3898FF` | Píldora y avatar de **Jhon** (`🟦`) |
| `accentSol` | `#AF52DE` | `#C969FF` | Píldora y avatar de **Sol** (`🟪`) |
| `winnerEmerald` | `#10B981` | `#34D399` | Insignia de **Súper Ganador** y ahorro en `RD$` |

### 🔤 Jerarquía Tipográfica

* **Precios y Totales (`RD$ 989.00`):** `SF Pro Rounded` / `Inter Tight` en `800 ExtraBold` con `tabular-nums` para que al animar un cambio de precio los dígitos no bailen horizontalmente.
* **Nombres de Producto:** `15px` `600 SemiBold`, `letterSpacing: -0.2`.
* **Píldoras de Supermercado y Autor:** `11px` `700 Bold`, cápsulas de radio completo (`borderRadius: 9999`).

---

## 3. Arquitectura Visual de las 4 Pantallas (Layout & Wireframes)

### Pantalla 1: "Nuestra Lista" (Home Sincronizada)

Diseño limpio con lista unificada, indicador de sincronización en vivo y una **Isla Flotante Inferior (*Dynamic Bottom Bar*)** que se expande en un buscador al tocarla.

```text
┌──────────────────────────────────────────────────────┐
│  ● Sincronizado                        [ 🟦 Soy Jhon ]│
│  Nuestra Compra                                      │
│  14 artículos · 8 Jhon · 6 Sol                       │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │ [🖼️]  Arroz Premium Campos 10 Lb    [- 1 +]   │  │
│  │       🟦 Jhon · ~RD$474 en Plaza Lama          │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │ [🖼️]  Leche Evaporada Carnation     [- 2 +]   │  │
│  │       🟪 Sol · "Para el postre" · ~RD$150      │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │ [🖼️]  Ketchup Heinz 14 Oz           [- 1 +]   │  │
│  │       🟦 Jhon · ~RD$135 en Plaza Lama          │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│                                                      │
│  ╔════════════════════════════════════════════════╗  │
│  ║ 🔍 Agregar producto...     [⚡ Comparar RD$989] ║  │
│  ╚════════════════════════════════════════════════╝  │
└──────────────────────────────────────────────────────┘
```

### Pantalla 2: Buscador en Vivo 5 Súpers (Morphing Sheet)

Al tocar `🔍 Agregar producto...`, la isla inferior **se estira elásticamente hacia arriba** convirtiéndose en el buscador en vivo con autocompletado y precios comparados por tienda.

```text
┌──────────────────────────────────────────────────────┐
│  🔍 [ ketchup heinz                        ✕ ] [1x]  │
│  📝 [ Nota opcional (ej. sin azúcar)...            ] │
├──────────────────────────────────────────────────────┤
│  ⚡ BUSCANDO EN 5 SUPERMERCADOS EN VIVO...            │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │ [🖼️]  Ketchup Heinz 14 Oz           [+ Agregar]│  │
│  │       ★ Mejor precio: RD$135 en Plaza Lama     │  │
│  │                                                │  │
│  │  (Plaza Lama RD$135) (Sirena RD$145)           │  │
│  │  (Nacional RD$149)   (Jumbo RD$148)            │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │ [🖼️]  Ketchup Heinz Picnic 32 Oz    [+ Agregar]│  │
│  │       ★ Mejor precio: RD$265 en Jumbo          │  │
│  │                                                │  │
│  │  (Jumbo RD$265) (Nacional RD$270)              │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Pantalla 3: "El Súper Ganador" (Bento Comparador)

Al tocar `[⚡ Comparar]`, aparece un **Bento Card Hero** con el supermercado ganador y el ranking interactivo de los 5 súpers.

```text
┌──────────────────────────────────────────────────────┐
│  ← Volver          Comparación Total                 │
├──────────────────────────────────────────────────────┤
│  ╔════════════════════════════════════════════════╗  │
│  ║ 🏆 SÚPER GANADOR HOY                           ║  │
│  ║ Plaza Lama                         RD$ 989.00  ║  │
│  ║ 4 de 4 productos (100%) · Ahorras RD$ 64.00    ║  │
│  ║                                                ║  │
│  ║ [ 🛒 Iniciar Modo En el Súper en Plaza Lama ]  ║  │
│  ╚════════════════════════════════════════════════╝  │
│                                                      │
│  RANKING COMPLETO DE TU LISTA                        │
│                                                      │
│  #1  Plaza Lama        ██████████ 4/4    RD$ 989.00  │
│  #2  Jumbo             ██████████ 4/4   RD$ 1,006.75 │
│  #3  La Sirena         ██████████ 4/4   RD$ 1,008.00 │
│  #4  Nacional          ████████░░ 3/4   RD$ 1,045.00 │
│      └─ ⚠️ Falta 1 prod. (imputado prom. mercado)    │
└──────────────────────────────────────────────────────┘
```

### Pantalla 4: "Modo En el Súper" (Checklist de Pasillo)

Diseñado para ir tachando mientras caminan por el pasillo. La barra superior muestra el progreso líquido y el subtotal exacto de lo que ya está dentro del carrito físico.

```text
┌──────────────────────────────────────────────────────┐
│  📍 Comprando en Plaza Lama               [Salir]    │
│  ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░ 50% en el carrito              │
│                                                      │
│  EN EL CARRITO: RD$ 624.00   │  FALTA: RD$ 365.00    │
├──────────────────────────────────────────────────────┤
│  PENDIENTES EN PASILLO (2)                           │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │ ( ) [🖼️] Ketchup Heinz 14 Oz          RD$ 135  │  │
│  │          1x · 🟦 Jhon                          │  │
│  └────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │ ( ) [🖼️] Queso Sosua De Freir Lb      RD$ 230  │  │
│  │          1x · 🟪 Sol                           │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  YA EN EL CARRITO (2)                                │
│  ┌────────────────────────────────────────────────┐  │
│  │ (✓) [🖼️] ~Arroz Premium Campos 10 Lb~ RD$ 474  │  │
│  │          Tachado por Sol 🟪                    │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

---

## 4. Catálogo de Micro-Interacciones `60fps.design/motion`

Cada interacción de la app sigue el estándar de **60fps.design**: física de resortes continua, interrumpible por el dedo del usuario en cualquier milisegundo y acompañada de respuesta háptica sutil.

### 1️⃣ Isla Inferior que hace *Morphing* al Buscador (*Dynamic Island Search*)
* **Inspiración 60fps:** *Arc Search / Dynamic Island Expansion*.
* **Cómo se siente:** En reposo, la barra inferior flota a `16px` del borde con efecto cristal (`expo-glass-effect`), mostrando `🔍 Agregar...` a la izquierda y el botón verde `[⚡ Comparar RD$989]` a la derecha. Al tocar `🔍 Agregar`, la píldora **se expande con un resorte continuo** hasta convertirse en el modal de búsqueda, sin cortes bruscos de pantalla.
* **Parámetros de Resorte:** `withSpring({ damping: 24, stiffness: 300, mass: 0.8 })`.

### 2️⃣ Stepper de Cantidad con *Rolling Ticker* (`1` → `2` → `3`)
* **Inspiración 60fps:** *Cash App / Family Wallet Number Roller*.
* **Cómo se siente:** Cuando Jhon o Sol tocan `+` en la leche evaporada:
  - El botón `- 2 +` hace una micro-compresión elástica (`scale: 0.94 -> 1.0`).
  - El dígito `1` se desliza hacia arriba con `opacity: 0` mientras el `2` entra desde abajo con un resorte rápido (`translateY: 12 -> 0`).
  - El subtotal de la tarjeta (`~RD$75` → `~RD$150`) rueda sus dígitos como el odómetro de un auto.

### 3️⃣ Tachado de Pasillo con *Strikethrough Sweep* y Reordenamiento Fluido
* **Inspiración 60fps:** *Things 3 / Linear Issue Completion*.
* **Cómo se siente:** En el **Modo En el Súper**, al tocar un producto para echarlo al carrito físico:
  1. **0ms – 120ms:** El círculo del checkbox hace un *pop* elástico (`scale: 0.8 -> 1.15 -> 1.0`) rellenándose del color de quien lo tachó (Azul si fue Jhon, Violeta si fue Sol).
  2. **80ms – 220ms:** Una línea horizontal atraviesa el nombre del producto de izquierda a derecha (`width: '0%' -> '100%'`) mientras la foto atenúa su opacidad a `0.55`.
  3. **220ms – 450ms:** Usando `LinearTransition.springify().damping(20).stiffness(220)`, la tarjeta se desliza suavemente hacia la sección inferior **"YA EN EL CARRITO"** mientras los productos pendientes suben para ocupar su espacio sin ningún salto brusco.

### 4️⃣ *Elastic Swipe-to-Delete* con Umbral Magnético
* **Inspiración 60fps:** *iOS Mail / Telegram Elastic Action Reveal*.
* **Cómo se siente:** Al deslizar un producto hacia la izquierda:
  - El icono de papelera (`🗑️`) crece proporcionalmente al desplazamiento del dedo (`interpolate(translateX, [0, -80], [0.5, 1.1])`).
  - Al cruzar el umbral de `-95px`, el icono da un pequeño tirón magnético (*snap*) con un pulso háptico indicando que si sueltas el dedo se eliminará con un colapso vertical suave (`FadeOutLeft` + `LinearTransition`).

### 5️⃣ Entrada en Cascada de los 5 Supermercados (*Staggered Search Cards*)
* **Inspiración 60fps:** *Raycast Mobile / Perplexity Source Cards*.
* **Cómo se siente:** Cuando el backend responde con los productos de La Sirena, Nacional, Jumbo, Plaza Lama y Bravo:
  - Cada tarjeta entra con un retraso escalonado de `40ms` (`FadeInDown.delay(index * 40).springify().damping(22)`).
  - Dentro de cada tarjeta, la píldora del supermercado más barato tiene un brillo sutil esmeralda (`rgba(16, 185, 129, 0.14)`).

### 6️⃣ Selector de Perfil ("Soy Jhon" / "Soy Sol") con *3D Card Press*
* **Inspiración 60fps:** *Apple Passbook / Duolingo Profile Switcher*.
* **Cómo se siente:** Al tocar la píldora superior `[ 🟦 Soy Jhon ]`, se despliega una tarjeta flotante translúcida donde cambiar entre **Jhon** y **Sol** anima el borde activo y cambia el acento cromático de toda la pantalla suavemente (`interpolateColor` en `250ms`).

---

## 5. Estructura de Componentes Propuesta para `movil-app-gasty`

```text
src/
├── constants/
│   ├── theme.ts               # Paleta Alabaster/Obsidian + Colores Jhon/Sol
│   └── motion.ts              # Presets de resortes 60fps (snappy, gentle, bouncy)
├── components/
│   ├── motion/
│   │   ├── AnimatedNumber.tsx # Odómetro / Rolling Ticker para precios RD$
│   │   ├── PressableScale.tsx # Wrapper táctil con spring scale (0.96) en cada botón
│   │   └── Strikethrough.tsx  # Línea animada al tachar en el pasillo
│   ├── list/
│   │   ├── ProductRowCard.tsx # Tarjeta minimalista con foto, autor, swipe y stepper
│   │   ├── FloatingIsland.tsx # Barra inferior de cristal (Búsqueda + Botón Comparar)
│   │   └── ProfilePill.tsx    # Conmutador animado 🟦 Jhon / 🟪 Sol
│   ├── search/
│   │   └── LiveSearchSheet.tsx# Modal elástico con resultados en cascada de los 5 súpers
│   └── compare/
│       ├── WinnerBentoCard.tsx# Tarjeta Hero del supermercado ganador
│       └── AisleProgress.tsx  # Barra superior líquida para "Modo En el Súper"
```
