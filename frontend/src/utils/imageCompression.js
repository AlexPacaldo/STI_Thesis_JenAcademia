export const compressImageFile = (file, { maxDimension = 1600, quality = 0.85 } = {}) => new Promise((resolve, reject) => {
  if (!file || !file.type?.startsWith("image/")) {
    reject(new Error("Please choose an image file."));
    return;
  }

  const image = new Image();
  const objectUrl = URL.createObjectURL(file);

  image.onload = () => {
    URL.revokeObjectURL(objectUrl);

    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to compress image."));
        return;
      }

      const baseName = file.name ? file.name.replace(/\.[^.]+$/, "") : "image";
      resolve(new File([blob], `${baseName}.webp`, { type: "image/webp" }));
    }, "image/webp", quality);
  };

  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error("Unable to read image file."));
  };

  image.src = objectUrl;
});

export const compressFileIfImage = async (file, options) => {
  if (!file || !file.type?.startsWith("image/")) return file;
  return compressImageFile(file, options);
};
