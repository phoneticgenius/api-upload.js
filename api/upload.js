// Filename: api/upload.js
const { Dropbox } = require('dropbox');

const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
if (!DROPBOX_ACCESS_TOKEN) {
  throw new Error('DROPBOX_ACCESS_TOKEN is not set in environment variables.');
}

const dbx = new Dropbox({ accessToken: DROPBOX_ACCESS_TOKEN });

// CORS helper
const enableCors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

module.exports = async (req, res) => {
  enableCors(res);

  // Preflight request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Image data is missing.' });
    }

    // Validate base64 image data
    const matches = image.match(/^data:image\/(png|jpeg);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid image data format.' });
    }

    const buffer = Buffer.from(matches[2], 'base64');
    const filename = `/drawings/drawing-${Date.now()}.png`;

    // Upload to Dropbox
    const uploadResult = await dbx.filesUpload({
      path: filename,
      contents: buffer,
      mode: { '.tag': 'overwrite' },
    });

    // Create or retrieve shared link
    let publicUrl;
    try {
      const shareResult = await dbx.sharingCreateSharedLinkWithSettings({
        path: uploadResult.result.path_display,
        settings: { requested_visibility: 'public' },
      });
      publicUrl = shareResult.result.url.replace('dl=0', 'dl=1');
    } catch (e) {
      // If link already exists, fetch it
      const links = await dbx.sharingListSharedLinks({
        path: uploadResult.result.path_display,
        direct_only: true,
      });
      if (links.result.links.length > 0) {
        publicUrl = links.result.links[0].url.replace('dl=0', 'dl=1');
      } else {
        throw e; // rethrow if something else went wrong
      }
    }

    res.status(200).json({ url: publicUrl });
  } catch (err) {
    console.error('Dropbox API Error:', err);
    res.status(500).json({ error: 'An error occurred during upload.' });
  }
};
