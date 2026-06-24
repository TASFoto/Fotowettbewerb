const express = require("express");
const multer = require("multer");
const axios = require("axios");
const path = require("path");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 10 } });

const KEY_ID = process.env.B2_KEY_ID;
const APP_KEY = process.env.B2_APP_KEY;
const BUCKET_NAME = process.env.B2_BUCKET_NAME || "Fotowettbewerb";
const RETAIN_UNTIL = new Date("2027-04-30T23:59:59Z").getTime();

async function getB2Auth() {
  const credentials = Buffer.from(KEY_ID + ":" + APP_KEY).toString("base64");
  const res = await axios.get("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
    headers: { Authorization: "Basic " + credentials },
  });
  return res.data;
}

async function getUploadUrl(auth) {
  const res = await axios.post(
    auth.apiUrl + "/b2api/v2/b2_get_upload_url",
    { bucketId: auth.allowed.bucketId },
    { headers: { Authorization: auth.authorizationToken } }
  );
  return res.data;
}

async function uploadToB2(auth, uploadUrl, file, fileName) {
  const crypto = require("crypto");
  const sha1 = crypto.createHash("sha1").update(file.buffer).digest("hex");
  const res = await axios.post(uploadUrl.uploadUrl, file.buffer, {
    headers: {
      Authorization: uploadUrl.authorizationToken,
      "X-Bz-File-Name": encodeURIComponent(fileName),
      "Content-Type": file.mimetype,
      "Content-Length": file.size,
      "X-Bz-Content-Sha1": sha1,
      "X-Bz-Object-Lock-Mode": "COMPLIANCE",
      "X-Bz-Object-Lock-Retain-Until-Date": new Date(RETAIN_UNTIL).toISOString(),
    },
    maxBodyLength: Infinity,
  });
  return res.data;
}

app.use(express.static(__dirname));

app.post("/upload", upload.array("photos", 10), async (req, res) => {
  try {
    const name = req.body.name || "Unbekannt";
    const files = req.files;
    if (!files || files.length === 0) return res.json({ success: false, error: "Keine Dateien" });

    const auth = await getB2Auth();
    const uploadUrl = await getUploadUrl(auth);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const timestamp = Date.now() + i;
      const ext = file.originalname.split(".").pop();
      const fileName = timestamp + "_" + name.replace(/\s+/g, "_") + "_" + (i + 1) + "." + ext;
      await uploadToB2(auth, uploadUrl, file, fileName);
    }

    res.json({ success: true, count: files.length });
  } catch (err) {
    console.error(err && err.response ? err.response.data : err.message);
    res.json({ success: false, error: "Upload fehlgeschlagen" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log("Server laeuft auf Port " + PORT); });
