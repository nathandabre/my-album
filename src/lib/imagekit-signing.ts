import ImageKit from "@imagekit/nodejs";

export function buildSignedImageKitUrl(
  options: {
    privateKey: string;
    endpoint: string;
    filePath: string;
    transformations?: string;
    expiresIn: number;
  },
) {
  const endpointUrl = new URL(options.endpoint);
  if (
    endpointUrl.protocol !== "https:" ||
    endpointUrl.username ||
    endpointUrl.password ||
    !options.filePath.startsWith("/albums/") ||
    options.filePath.split("/").includes("..") ||
    !Number.isInteger(options.expiresIn) ||
    options.expiresIn < 1 ||
    options.expiresIn > 300
  ) {
    throw new Error("ImageKit signed URL options are invalid");
  }

  const source = options.transformations
    ? `/tr:${options.transformations}${options.filePath}`
    : options.filePath;
  const client = new ImageKit({ privateKey: options.privateKey });
  const signedUrl = client.helper.buildSrc({
    urlEndpoint: endpointUrl.toString().replace(/\/+$/, ""),
    src: source,
    signed: true,
    expiresIn: options.expiresIn,
  });
  const url = new URL(signedUrl);
  if (url.origin !== endpointUrl.origin) {
    throw new Error("ImageKit generated a URL outside its configured endpoint");
  }
  return url;
}
