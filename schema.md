# SCHEMA.md - Strict JSON Structure for Motion Scenes

Seluruh data adegan animasi wajib mematuhi struktur skema di bawah ini. Ekstensi file yang digunakan adalah `.json`.

## Skema JSON (TypeScript Interface Reference)

```typescript
interface PathNode {
  x: number;
  y: number;
  ctrlX?: number; // Opsional, jika absen maka dihitung sebagai garis lurus
  ctrlY?: number; // Opsional, jika absen maka dihitung sebagai garis lurus
}

interface SceneElement {
  id: string;          // Identifier unik untuk target Subscriber
  pathNodes: PathNode[]; // Array koordinat penentu jalur
  duration?: number;   // Wajib diisi jika triggerType === "timer" (dalam detik)
  delay?: number;      // Opsional untuk mode timer (dalam detik)
  ease?: string;       // Opsional untuk mode timer (Format string GSAP, misal: "power2.out")
  repeat?: number;     // Opsional untuk mode timer (-1 untuk infinite loop)
}

interface ScrollConfig {
  scrub: boolean | number; // true atau angka indeks kelembaman (smoothing)
  pin: boolean;            // Tahan layar selama animasi berlangsung
}

interface MotionScene {
  sceneId: string;
  triggerType: "scroll" | "timer";
  scrollConfig?: ScrollConfig; // Wajib jika triggerType === "scroll"
  elements: SceneElement[];
}