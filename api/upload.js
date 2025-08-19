const { Dropbox } = require('dropbox');
const fetch = require('isomorphic-fetch');

// Retrieve environment variables
const DROPBOX_APP_KEY = process.env.DROPBOX_APP_KEY;
const DROPBOX_APP_SECRET = process.env.DROPBOX_APP_SECRET;
const DROPBOX_REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;

// Throw an error if any of the environment variables are missing
if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET || !DROPBOX_REFRESH_TOKEN) {
  throw new Error('Dropbox environment variables are not set.');
}

// Initialize Dropbox with the refresh token. The SDK handles token refreshing.
const dbx = new Dropbox({
  fetch: fetch,
  clientId: DROPBOX_APP_KEY,
  clientSecret: DROPBOX_APP_SECRET,
  refreshToken: DROPBOX_REFRESH_TOKEN,
});

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

      // Use the URL exactly as returned and then ensure it has the '?dl=0' parameter
      publicUrl = shareResult.result.url.replace('dl=1', 'dl=0');

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
          publicUrl = links.result.links[0].url.replace('dl=1', 'dl=0');
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
