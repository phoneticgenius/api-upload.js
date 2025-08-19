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

const dbx = new Dropbox({
  fetch: fetch,
  clientId: DROPBOX_APP_KEY,
  clientSecret: DROPBOX_APP_SECRET,
});

dbx.auth.setRefreshToken(DROPBOX_REFRESH_TOKEN);

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

  const uploadAndShare = async () => {
    const { image } = req.body;
    if (!image) {
      throw new Error('Image data is missing.');
    }

    const matches = image.match(/^data:image\/(png|jpeg);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid image data format.');
    }

    const buffer = Buffer.from(matches[2], 'base64');
    const filename = `/drawings/drawing-${Date.now()}.png`;

    const uploadResult = await dbx.filesUpload({
      path: filename,
      contents: buffer,
      mode: { '.tag': 'overwrite' },
    });

    let publicUrl;
    try {
      const shareResult = await dbx.sharingCreateSharedLinkWithSettings({
        path: uploadResult.result.path_display,
        settings: { requested_visibility: 'public' },
      });
      publicUrl = shareResult.result.url.replace('dl=1', 'dl=0');
    } catch (e) {
      if (e.status === 409 && e.error.error[".tag"] === "shared_link_already_exists") {
        const links = await dbx.sharingListSharedLinks({
          path: uploadResult.result.path_display,
          direct_only: true,
        });
        if (links.result.links.length > 0) {
          publicUrl = links.result.links[0].url.replace('dl=1', 'dl=0');
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }
    return publicUrl;
  };

  try {
    const publicUrl = await uploadAndShare();
    res.status(200).json({ url: publicUrl });
  } catch (err) {
    console.error('Dropbox API Error:', err);

    // Check specifically for the expired access token error
    if (err.status === 401 && err.error && err.error.error && err.error.error['.tag'] === 'expired_access_token') {
      try {
        console.log('Access token expired. Attempting to refresh...');
        const newAccessToken = await dbx.auth.getAccessTokenFromRefreshToken();
        dbx.auth.setAccessToken(newAccessToken.result.access_token);
        console.log('Access token refreshed. Retrying upload...');
        const publicUrl = await uploadAndShare();
        res.status(200).json({ url: publicUrl });
      } catch (refreshError) {
        console.error('Refresh token failed:', refreshError);
        res.status(401).json({ error: 'Failed to refresh token.' });
      }
    } else {
      res.status(500).json({ error: 'An error occurred during upload.' });
    }
  }
};
