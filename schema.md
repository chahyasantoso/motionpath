# SCHEMA.md - Strict JSON Structure for Motion Scenes

Seluruh data adegan animasi wajib mematuhi struktur skema di bawah ini. Ekstensi file yang digunakan adalah `.json`.

## Skema JSON (TypeScript Interface Reference)

```typescript
interface PathNode {
  x: number;
  y: number;
  z?: number;      // Opsional, jika absen maka diasumsikan 0 (depth)
  ctrlX?: number;  // Opsional, jika absen maka dihitung sebagai garis lurus
  ctrlY?: number;  // Opsional, jika absen maka dihitung sebagai garis lurus
  ctrlZ?: number;  // Opsional, jika absen maka diasumsikan 0
}

interface SceneElement {
  id: string;            // Identifier unik untuk target Subscriber
  pathNodes: PathNode[]; // Array koordinat penentu jalur
  duration?: number;     // Wajib diisi jika triggerType === "timer" (dalam detik)
  delay?: number;        // Opsional untuk mode timer (dalam detik)
  ease?: string;         // Opsional untuk mode timer (Format string GSAP, misal: "power2.out")
  repeat?: number;       // Opsional untuk mode timer (-1 untuk infinite loop)
  timeframe?: [number, number]; // Opsional, rentang waktu/scroll elemen [start, end] dari 0.0 sampai 1.0 (default [0, 1])
}

interface ScrollConfig {
  scrub: boolean | number; // true atau angka indeks kelembaman (smoothing)
  pin?: boolean | string;  // Opsional, tahan layar (boolean) atau CSS selector element yang di-pin
}

interface MotionScene {
  sceneId: string;
  triggerType: "scroll" | "timer";
  scrollConfig?: ScrollConfig; // Wajib jika triggerType === "scroll"
  elements: SceneElement[];
}
```