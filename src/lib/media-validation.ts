export function detectMediaType(data: Buffer) {
  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    data.length >= 8 &&
    data
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (
    data.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(data.toString("ascii", 0, 6))
  ) {
    return "image/gif";
  }
  if (
    data.length >= 12 &&
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (data.length >= 12 && data.toString("ascii", 4, 8) === "ftyp") {
    const majorBrand = data.toString("ascii", 8, 12);
    const compatibleBrands = new Set<string>();
    for (let offset = 16; offset + 4 <= data.length; offset += 4) {
      compatibleBrands.add(data.toString("ascii", offset, offset + 4));
    }
    if (
      ["avif", "avis"].includes(majorBrand) ||
      (majorBrand === "mif1" &&
        (compatibleBrands.has("avif") || compatibleBrands.has("avis")))
    ) {
      return "image/avif";
    }
    if (majorBrand === "qt  ") return "video/quicktime";
    if (
      ["isom", "iso2", "iso3", "iso4", "mp41", "mp42", "avc1", "M4V ", "MSNV", "dash"].includes(
        majorBrand,
      )
    ) {
      return "video/mp4";
    }
  }
  if (
    data.length >= 4 &&
    data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  ) {
    return "video/webm";
  }
  return null;
}
