// pdf.js is loaded on demand, only when a PDF is attached; its legacy build runs on older Android WebViews too.
declare module 'pdfjs-dist/legacy/build/pdf.mjs';
declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url' { const url: string; export default url; }
