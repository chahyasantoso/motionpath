# Architecture Exploration: MotionPath Unified Driver & Lazy Instance Model

Dokumen ini mendokumentasikan seluruh perjalanan diskusi, analisis, dan keputusan desain arsitektur untuk sistem driver dan instance di MotionPath.

---

## 1. Titik Awal & Masalah Konseptual

Pertanyaan awal: _Bisakah `TimelineDriver` dijadikan delegate bawaan yang berisi GSAP ticker/ScrollTrigger?_

Saat ini, terdapat dua jalur (_path_) eksekusi yang berbeda secara fundamental dalam mendeteksi dan menjalankan progress animasi:

- **GSAP Timeline/Scroll** (`driver.type: 'timeline'`): Dikelola sepenuhnya secara otomatis oleh engine menggunakan GSAP ticker & ScrollTrigger (**Push Model**).
- **Delegate** (`driver.type: 'delegate'`): Dikuasai secara manual oleh caller (misal: game loop) dengan memanggil `resolveMotion` (**Pull Model**).

---

## 2. Unifikasi Driver: Mengatasi Bentrokan Push vs. Pull

Untuk menyatukan keduanya, kita mengenalkan konsep: **Semua motion memiliki paused tween sebagai backing store. "Driver" hanyalah penentu siapa yang memanggil `tween.progress(p)`.**

```
GSAP Driver (Built-in)  ──> gsap.ticker secara otomatis memanggil tween.progress()
Manual Driver (Custom)  ──> Caller secara manual memanggil engine.drive(instanceId, progress)
```

Dengan model ini, seluruh driver memiliki interface konsumsi yang seragam:

```js
engine.subscribe(instanceId, trackId, callback); // Untuk push/reactive update
engine.resolveMotion(motionId, progress, overrides); // Untuk sync/immediate query
```

---

## 3. Pergeseran ke Arsitektur Lazy / Instance

Untuk mendukung kebutuhan multi-instance (seperti menduplikasi gerakan yang sama untuk banyak objek/karakter), arsitektur bergeser dari **Eager Build** menjadi **Lazy/Instance Model** (seperti _Class vs. Object_):

- **Dulu (Eager)**: `loadProject(schema)` langsung membangun seluruh timeline untuk semua motion sekaligus.
- **Sekarang (Lazy)**: `loadProject(schema)` hanya menyimpan definisi/template gerakan. Pembuatan timeline nyata dilakukan saat runtime via `mountInstance`.

```
loadProject(schema)
  └── mountInstance(motionId, config) ──> return Instance Object
```

Setiap objek instance yang di-return memiliki API mandiri (`subscribe`, `drive`, `destroy`, `addChild`).

---

## 4. Komposisi Parent-Child (`addChild`) & Stagger Dinamis

Salah satu tantangan terbesar dari model instance adalah bagaimana menangani _stagger_ (animasi beruntun seperti list card) secara dinamis tanpa kaku mendefinisikan jumlah elemen di schema.

Solusinya adalah mengenalkan fungsi **`addChild`** pada objek instance:

1. **Lifecycle Terikat**: Jika parent di-destroy/pause/play, seluruh child otomatis mengikuti.
2. **Stagger Didefinisikan di Schema, Dinamis di Runtime**:
   - Designer mendefinisikan nilai stagger statis di JSON schema (misal `stagger: 0.15`).
   - Engine secara otomatis menghitung delay kumulatif untuk setiap anak yang di-mount berdasarkan jumlah anak saat ini (`childIndex * stagger`).

#### Pendekatan Lifecycle Jangkar (Cara 2)

Dibandingkan membuat konsep baru seperti `createGroup()`, kita memilih menggunakan **elemen pertama dalam list sebagai parent (jangkar)**, dan elemen-elemen berikutnya sebagai anak (`addChild`):

```jsx
// 1. Elemen pertama menjadi parent (delay = 0s)
const firstCard = engine.mountInstance("single-card-reveal");
firstCard.subscribe("card-body", (patch) => apply(items[0].el, patch));

// 2. Elemen berikutnya otomatis menjadi child dengan delay kumulatif (0.15s, 0.30s, dst)
items.slice(1).forEach((item) => {
  const nextCard = firstCard.addChild(); // Bersih, tanpa perlu passing delay manual
  nextCard.subscribe("card-body", (patch) => apply(item.el, patch));
});

// 3. Cleanup massal
firstCard.destroy(); // Menghancurkan dirinya sendiri DAN semua child-nya
```

---

## 5. Hubungan `resolveMotion` dengan `mount + subscribe + drive`

Secara konseptual, `resolveMotion` adalah **shorthand / bentuk instan (ephemeral)** dari gabungan ketiga fungsi instance:

$$\text{resolveMotion}(Id, p) \equiv \text{mountInstance}(Id) + \text{subscribe}() + \text{driveInstance}(p)$$

Kedua kemasan ini saling melengkapi sesuai dengan kebutuhan runtime:

| Fitur                 | `resolveMotion(motionId, p, overrides)`              | `mount + subscribe + drive`                     |
| --------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| **Aliran Data**       | **Pull Model** (Synchronous Return)                  | **Push Model** (Asynchronous Callback)          |
| **Tween Lifecycle**   | _Shared_ & _ephemeral_ (dibuat/di-seek lalu dibuang) | _Persistent_ & _dedicated_ di dalam memori      |
| **Dynamic Overrides** | Sangat murah (bisa berubah drastis di setiap frame)  | Mahal (memerlukan rekalkulasi/rebuild)          |
| **Kasus Penggunaan**  | Game Entity System, kalkulasi fisika instan          | Reactive UI (React Component), GSAP-driven loop |

---

## 6. Desain Pemutar Animasi (Player API) & Capability Matrix

Setiap instance yang dilahirkan oleh Engine bertindak sebagai **"Player"** (Pemutar Animasi) yang mandiri.

- `seek(progress)` didukung oleh **semua driver** karena di bawah tudung, semua instance diwakili oleh GSAP timeline.
- `play()` dan `pause()` hanya didukung oleh `gsap-timeline` karena tipe ini yang berjalan otomatis berdasarkan waktu.

| Driver Type         | `seek(progress)` | `play()` / `pause()`    | Keterangan                                      |
| ------------------- | ---------------- | ----------------------- | ----------------------------------------------- |
| **`gsap-timeline`** | ✅ Bisa          | ✅ Bisa                 | Di-drive otomatis oleh waktu.                   |
| **`gsap-scroll`**   | ✅ Bisa          | ❌ Tidak (Strict Error) | Di-drive oleh scroll, tapi bisa di-seek manual. |
| **`manual`**        | ✅ Bisa          | ❌ Tidak (Strict Error) | Di-drive manual oleh caller via `seek()`.       |

---

## 7. Hierarki Class OOP ala Dart (Penerapan di JS)

Untuk menstrukturkan arsitektur Player tanpa menimbulkan duplikasi kode, kita menerapkan konsep **Abstract Class & Subclass (Pola OOP Dart)** menggunakan ES6 Class di JavaScript.

```
                  ┌──────────────────────┐
                  │    MotionInstance    │  <── (Abstract Base Class)
                  └──────────┬───────────┘       Menyimpan: subscribe(), addChild(), destroy()
                             │
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
┌──────────────────────┐ ┌──────────────┐ ┌──────────────┐
│TimelineMotionInstance│ │ScrollInstance│ │ManualInstance│  <── (Implementasi Subclass)
└──────────────────────┘ └──────────────┘ └──────────────┘
  Menambahkan:             Menambahkan:     Sederhana:
  - play() / pause()       - ScrollTrigger  - Hanya mewarisi
  - autoplay logic         - Custom destroy   induk & seek()
```

### Implementasi Dasar Abstract Class (Simulasi Runtime Dart di JS)

```js
export class MotionInstance {
  constructor(motionId, config, schemaMotion) {
    if (new.target === MotionInstance) {
      throw new TypeError(
        "Cannot construct MotionInstance instances directly (Abstract Class).",
      );
    }
    this.id = generateUniqueId();
    this.motionId = motionId;
    this.children = [];
    this.timeline = buildTimeline(schemaMotion, config);
  }

  subscribe(trackId, callback) {
    /* shared logic */
  }
  addChild(config) {
    /* shared logic */
  }

  seek(progress) {
    throw new Error("Method 'seek()' must be implemented by subclass.");
  }

  destroy() {
    this.children.forEach((child) => child.destroy());
    this.timeline.kill();
  }
}
```

### Implementasi Subclass Spesifik

```js
// Timeline Player
export class TimelineMotionInstance extends MotionInstance {
  seek(progress) { this.timeline.progress(progress); }
  play() { this.timeline.play(); }
  pause() { this.timeline.pause(); }
}

// Scroll Player
export class ScrollMotionInstance extends MotionInstance {
  constructor(motionId, config, schemaMotion, deps) {
    super(motionId, config, schemaMotion);
    this.scrollTrigger = ScrollTrigger.create({ animation: this.timeline, ... });
  }
  seek(progress) { this.timeline.progress(progress); }
  destroy() {
    if (this.scrollTrigger) this.scrollTrigger.kill();
    super.destroy();
  }
}
```

---

## 8. Arsitektur Final MotionPath

```
               [loadProject(schema)]
                         │
                         ▼
             (Simpan Motion Templates)
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
   [mountInstance()]           [resolveMotion()] (Shorthand Sync)
            │                         │
            ▼                         ▼
    (Abstract Factory)           (Return Patch)
            │
  ┌─────────┼─────────┐
  ▼         ▼         ▼
[Timeline] [Scroll] [Manual] (OOP Instances / Players)
```

Arsitektur ini melahirkan sistem yang fleksibel, aman secara tipe/perilaku (OOP Strict), efisien dalam manajemen memori, dan memberikan pengalaman koding yang sangat intuitif bagi developer.
