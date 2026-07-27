# Product Requirement Document (PRD) - React Motion Path Engine (MVP)

## 1. Objective & Architecture Philosophy
Membangun sebuah engine animasi berbasis *Motion Path* menggunakan React dan GSAP dengan pendekatan **"Data-First"** dan **"Progress-Driven Pub/Sub"**. Engine ini harus berjalan secara otonom di luar siklus render React (*Zero Re-render*) untuk memastikan performa stabil di 60fps baik pada skenario *Scroll-Driven (Scrollytelling)* maupun *Time-Driven (Timer)*.

## 2. Core Tech Stack
- Framework: React (Hooks, Refs)
- Animation Core: GSAP (GreenSock Animation Platform)
- Plugins: GSAP MotionPathPlugin, GSAP ScrollTrigger
- Orchestration: Vanilla JS Singleton Pattern (Pub/Sub)

## 3. System Components & Flow
1. **The JSON Schema:** Menyimpan data spasial (koordinat kurva) dan konfigurasi trigger adegan (*scene*).
2. **The Polymorphic Engine (`GsapPubSub`):** Kelas Vanilla JS murni (Singleton) yang menganimasikan Objek Proxy JavaScript `{ x, y, rotation, progress }` menggunakan GSAP, lalu menyiarkan nilainya 60 kali per detik melalui Event Emitter kustom.
3. **The Headless Initializer Hook (`useMotionPlayer`):** Hook React yang bertugas memicu inisialisasi adegan pada Engine berdasarkan data JSON dan referensi kontainer DOM.
4. **The Smart Subscriber Hook (`useMotionSubscriber`):** Hook pendengar yang dipasang di komponen UI untuk menangkap siaran koordinat secara langsung dan menyuntikkannya ke DOM menggunakan `gsap.set()` (*Bypassing Virtual DOM*).

## 4. Operational Boundaries (MVP Scope)
- **Multi-Path Scene:** Satu file JSON harus bisa menangani lebih dari satu elemen bergerak secara simultan dalam satu adegan.
- **Trigger Polymorphism:** Engine harus mampu mendeteksi secara otomatis apakah adegan dipicu oleh *Scroll* (mengikat progress ke scrollbar dengan `ease: "none"`) atau *Timer* (berjalan otomatis berdasarkan durasi dan kustom *easing*).
- **Otonomi Visual:** Efek visual seperti *opacity, scale, blur, background-color* TIDAK BOLEH disimpan di data JSON, melainkan harus dihitung secara mandiri oleh fungsi transformasi di level Subscriber menggunakan variabel `progress` (0.0 - 1.0).

## 5. Success Metrics
- Animasi berjalan mulus tanpa terjadi penurunan FPS (target 60fps konstan).
- Komponen React UI yang bergerak tidak mengalami *re-render* internal selama animasi berlangsung.
- Pembersihan (*cleanup*) memori yang sempurna saat komponen di-*unmount* (mencegah *memory leak* pada event listeners).