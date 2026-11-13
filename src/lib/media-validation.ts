function readAscii(data: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...data.subarray(start, end));
}

function bytesEqual(data: Uint8Array, expected: number[]) {
  return expected.every((value, index) => data[index] === value);
}

export function detectMediaType(data: Uint8Array) {
  if (
    data.length >= 3 &&
    bytesEqual(data.subarray(0, 3), [0xff, 0xd8, 0xff])
  ) {
    return "image/jpeg";
  }
  if (
    data.length >= 8 &&
    bytesEqual(data.subarray(0, 8), [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
  ) {
    return "image/png";
  }
  if (
    data.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(readAscii(data, 0, 6))
  ) {
    return "image/gif";
  }
  if (
    data.length >= 12 &&
    readAscii(data, 0, 4) === "RIFF" &&
    readAscii(data, 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (data.length >= 12 && readAscii(data, 4, 8) === "ftyp") {
    const majorBrand = readAscii(data, 8, 12);
    const compatibleBrands = new Set<string>();
    for (let offset = 16; offset + 4 <= data.length; offset += 4) {
      compatibleBrands.add(readAscii(data, offset, offset + 4));
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
    bytesEqual(data.subarray(0, 4), [0x1a, 0x45, 0xdf, 0xa3])
  ) {
    return "video/webm";
  }
  return null;
}
