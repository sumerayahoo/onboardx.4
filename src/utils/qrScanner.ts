import jsQR from "jsqr";

/**
 * Attempts to scan a QR code from a base64-encoded image.
 * Returns the decoded QR data string, or null if no QR found.
 */
export async function scanQRFromBase64(base64: string, mimeType: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qrResult = jsQR(imageData.data, imageData.width, imageData.height);
      resolve(qrResult?.data || null);
    };
    img.onerror = () => resolve(null);
    img.src = `data:${mimeType};base64,${base64}`;
  });
}
