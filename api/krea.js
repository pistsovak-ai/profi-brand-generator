export const maxDuration = 60;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt, kreaKey, aspectRatio } = req.body;

    if (!kreaKey) return res.status(400).json({ error: 'Krea API key required' });

    const validRatios = ['1:1','4:5','9:16','16:9','3:2','2:3','4:3','3:4'];
    const ratio = validRatios.includes(aspectRatio) ? aspectRatio : '1:1';

    // Submit to Krea
    const submitResp = await fetch('https://api.krea.ai/generate/image/google/nano-banana-pro', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + kreaKey,
        'Content-Type': 'application/json'
      },
  body: JSON.stringify({ prompt, aspect_ratio: ratio })
    });

    const submitText = await submitResp.text();
    console.log('Krea submit:', submitResp.status, submitText.slice(0, 300));

    let submitData;
    try { submitData = JSON.parse(submitText); } catch(e) {
      return res.status(500).json({ error: 'Krea parse error: ' + submitText.slice(0, 200) });
    }

    if (submitResp.status >= 400) {
      return res.status(500).json({ error: submitData.message || submitData.error || submitText.slice(0, 200) });
    }

    const jobId = submitData.job_id;
    if (!jobId) {
      return res.status(500).json({ error: 'No job_id: ' + submitText.slice(0, 200) });
    }

    // Poll for result — up to 55 seconds
    for (let i = 0; i < 18; i++) {
      await new Promise(r => setTimeout(r, 3000));

      const pollResp = await fetch('https://api.krea.ai/jobs/' + jobId, {
        headers: { 'Authorization': 'Bearer ' + kreaKey }
      });

      let pd;
      try { pd = await pollResp.json(); } catch(e) { continue; }
      console.log('Poll', i, ':', pd.status);

      if (pd.status === 'completed') {
        const r = pd.result || pd;
        const imageUrl =
          (typeof r.url === 'string' ? r.url : null) ||
          (typeof r.image_url === 'string' ? r.image_url : null) ||
          (Array.isArray(r.urls) ? r.urls[0] : null) ||
          (Array.isArray(r.images) ? (typeof r.images[0] === 'string' ? r.images[0] : r.images[0]?.url) : null) ||
          (typeof pd.url === 'string' ? pd.url : null);

        if (imageUrl) return res.status(200).json({ imageUrl });

        return res.status(500).json({ error: 'No imageUrl. Response: ' + JSON.stringify(pd).slice(0, 400) });
      }

      if (pd.status === 'failed' || pd.status === 'cancelled') {
        return res.status(500).json({ error: 'Krea job ' + pd.status });
      }
    }

    return res.status(500).json({ error: 'Timeout — попробуй ещё раз' });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
