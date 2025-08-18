// Filename: api/upload.js
const { Dropbox } = require('dropbox');

// Get the access token from a secure environment variable
const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;

// Initialize Dropbox client
const dbx = new Dropbox({ accessToken: DROPBOX_ACCESS_TOKEN });

module.exports = async (req, res) => {
    // Only allow POST requests for security
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    try {
        const { image } = req.body;
        if (!image) {
            return res.status(400).json({ error: 'Image data is missing.' });
        }

        const matches = image.match(/^data:image\/(png|jpeg);base64,(.+)$/);
        if (!matches) {
            return res.status(400).json({ error: 'Invalid image data format.' });
        }

        const buffer = Buffer.from(matches[2], 'base64');
        const filename = `/drawings/drawing-${Date.now()}.png`;

        // Upload the file to Dropbox
        const uploadResult = await dbx.filesUpload({
            path: filename,
            contents: buffer,
            mode: 'overwrite'
        });

        // Get a public, shareable link for the uploaded file
        const shareResult = await dbx.sharingCreateSharedLinkWithSettings({
            path: uploadResult.result.path_display,
            settings: {
                requested_visibility: 'public'
            }
        });

        // Dropbox provides a different link type; convert it for direct access
        const publicUrl = shareResult.result.url.replace('dl=0', 'dl=1');

        res.status(200).json({ url: publicUrl });
    } catch (err) {
        console.error('Dropbox API Error:', err);
        res.status(500).json({ error: 'An error occurred during upload.' });
    }
};
