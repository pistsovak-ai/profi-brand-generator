exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { prompt, kreaKey, aspectRatio } = JSON.parse(event.body);

    if (!kreaKey) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Krea API key required' })
      };
    }

    const validRatios = ['1:1','4:5','9:16','16:9','3:2','2:3','4:3','3:4'];
    const ratio = validRatios.includes(aspectRatio) ? aspectRatio : '1:1';

    // Submit to Krea Nano Banana Pro
    const resp = await fetch('https://api.krea.ai/generate/image/google/nano-banana-pro', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + kreaKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt: prompt, aspectRatio: ratio })
    });

    const rawText = await resp.text();
    console.log('Krea submit HTTP', resp.status, ':', rawText.slice(0, 300));

    let data;
    try { data = JSON.parse(rawText); } catch(e) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Krea parse error: ' + rawText.slice(0, 200) })
      };
    }

    if (resp.status >= 400) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: data.message || data.error || rawText.slice(0, 200) })
      };
    }

    const jobId = data.job_id;
    if (!jobId) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'No job_id from Krea: ' + rawText.slice(0, 200) })
      };
    }

    // Poll for result
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));

      const poll = await fetch('https://api.krea.ai/jobs/' + jobId, {
        headers: { 'Authorization': 'Bearer ' + kreaKey }
      });

      let pd;
      try { pd = await poll.json(); } catch(e) { continue; }
      console.log('Poll', i, 'status:', pd.status, 'keys:', Object.keys(pd).join(','));

      if (pd.status === 'completed') {
        // Try every possible field
        const r = pd.result || pd;
        const imageUrl =
          (typeof r.url === 'string' ? r.url : null) ||
          (typeof r.image_url === 'string' ? r.image_url : null) ||
          (typeof r.image === 'string' ? r.image : null) ||
          (Array.isArray(r.urls) ? r.urls[0] : null) ||
          (Array.isArray(r.images) ? (typeof r.images[0] === 'string' ? r.images[0] : r.images[0] && r.images[0].url) : null) ||
          (Array.isArray(r.outputs) ? r.outputs[0] : null) ||
          (typeof pd.url === 'string' ? pd.url : null) ||
          (typeof pd.image_url === 'string' ? pd.image_url : null);

        if (imageUrl) {
          return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ imageUrl: imageUrl })
          };
        }

        // Return full structure for debugging
        return {
          statusCode: 500,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Job completed but no imageUrl. Result: ' + JSON.stringify(pd).slice(0, 500) })
        };
      }

      if (pd.status === 'failed' || pd.status === 'cancelled') {
        return {
          statusCode: 500,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Krea job ' + pd.status })
        };
      }
    }

    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Timeout — попробуй ещё раз' })
    };

  } catch(e) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: e.message })
    };
  }
};
