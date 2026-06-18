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

    const validRatios = ['1:1','4:5','9:16','16:9','3:2','2:3','4:3','3:4','21:9'];
    const ratio = validRatios.includes(aspectRatio) ? aspectRatio : '1:1';

    // Submit to Krea Nano Banana Pro
    const resp = await fetch('https://api.krea.ai/generate/image/google/nano-banana-pro', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + kreaKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt, aspectRatio: ratio })
    });

    const rawText = await resp.text();
    console.log('Krea submit:', resp.status, rawText.slice(0, 300));

    let data;
    try { data = JSON.parse(rawText); } catch(e) {
      return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Krea parse error: ' + rawText.slice(0,200) }) };
    }

    if (resp.status >= 400) {
      return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: data.message || data.error || rawText.slice(0,200) }) };
    }

    const jobId = data.job_id;
    if (!jobId) {
      return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'No job_id: ' + rawText.slice(0,200) }) };
    }

    // Poll for result
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));

      const poll = await fetch('https://api.krea.ai/jobs/' + jobId, {
        headers: { 'Authorization': 'Bearer ' + kreaKey }
      });
      let pd;
      try { pd = await poll.json(); } catch(e) { continue; }
      console.log('Poll', i, ':', pd.status);

      if (pd.status === 'completed') {
        // Try every possible field where Krea might return the image URL
        const r = pd.result || pd;
        const imageUrl = r.url
          || r.image_url
          || r.image
          || r.output
          || (r.urls && r.urls[0])
          || (r.images && r.images[0] && (r.images[0].url || r.images[0]))
          || (r.outputs && r.outputs[0])
          || pd.url
          || pd.image_url;
        if (imageUrl && typeof imageUrl === 'string') {
          return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ imageUrl })
          };
        }
        // Return full response for debugging
        return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'completed but no URL found. Full response: ' + JSON.stringify(pd).slice(0,400) }) };
      }

      if (pd.status === 'failed' || pd.status === 'cancelled') {
        return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Krea job ' + pd.status }) };
      }
    }

    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Timeout' }) };

  } catch(e) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
  }
};
