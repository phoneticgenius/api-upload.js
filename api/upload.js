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

    // Create or retrieve a shared link that opens in the browser
    let publicUrl;
    try {
      const shareResult = await dbx.sharingCreateSharedLinkWithSettings({
        path: uploadResult.result.path_display,
        settings: { requested_visibility: 'public' },
      });

      // Get the URL and add the '?dl=0' parameter to ensure it opens in the browser
      publicUrl = shareResult.result.url.split('?')[0] + '?dl=0';

    } catch (e) {
      // If the link already exists, we will get a conflict error (409).
      // We can then retrieve the existing public link.
      if (e.status === 409 && e.error.error[".tag"] === "shared_link_already_exists") {
        const links = await dbx.sharingListSharedLinks({
          path: uploadResult.result.path_display,
          direct_only: true,
        });

        if (links.result.links.length > 0) {
          // Get the existing URL and ensure it has the '?dl=0' parameter
          publicUrl = links.result.links[0].url.split('?')[0] + '?dl=0';
        } else {
          // If the link is not found, something is wrong
          throw e;
        }
      } else {
        // Re-throw other errors
        throw e;
      }
    }

    res.status(200).json({ url: publicUrl });
  } catch (err) {
    console.error('Dropbox API Error:', err);
    res.status(500).json({ error: 'An error occurred during upload.' });
  }
};
