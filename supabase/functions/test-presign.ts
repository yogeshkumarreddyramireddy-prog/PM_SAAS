import { S3Client, GetObjectCommand } from "npm:@aws-sdk/client-s3"
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner"

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://792029c439aeda286319c6b8d44d7425.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: "dummy",
    secretAccessKey: "dummy",
  },
});

const command = new GetObjectCommand({
  Bucket: "phytomaps-files",
  Key: "Open_Water.geojson",
});

const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
console.log(uploadUrl);
