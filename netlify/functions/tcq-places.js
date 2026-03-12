// netlify/functions/tcq-places.js
// Server-side proxy for Google Places Autocomplete API — keeps API key out of browser

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Maps API key not configured' }) };

  try {
    const { input, sessionToken } = JSON.parse(event.body || '{}');
    if (!input || input.trim().length < 3) {
      return { statusCode: 200, headers, body: JSON.stringify({ predictions: [] }) };
    }

    const params = new URLSearchParams({
      input: input.trim(),
      components: 'country:us',
      key: apiKey,
      ...(sessionToken ? { sessiontoken: sessionToken } : {})
    });

    const res = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`);
    const data = await res.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: data.status, predictions: [] }) };
    }

    const predictions = (data.predictions || []).slice(0, 5).map(p => ({
      description: p.description,
      place_id: p.place_id
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ predictions }) };

  } catch (err) {
    console.error('tcq-places error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message, predictions: [] }) };
  }
};
