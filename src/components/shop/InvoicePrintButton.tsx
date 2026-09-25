"use client";

/**
 * "Save as PDF" is the browser's own print-to-PDF, triggered here.
 *
 * No PDF library is bundled: the invoice is a normal page with a print
 * stylesheet, and every browser can save that page as a PDF from its print
 * dialog. This keeps the download real (it is the exact page shown) without
 * shipping a heavy renderer to every visitor.
 */
export function InvoicePrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden rounded-full bg-sr-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sr-700"
    >
      Download / Print PDF
    </button>
  );
}
