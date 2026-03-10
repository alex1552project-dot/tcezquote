// netlify/functions/tcq-directions.js
// Server-side proxy for Google Directions API — keeps API key out of browser

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { origin, destination, avoidTolls } = JSON.parse(event.body);

    if (!origin || !destination) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Origin and destination are required' }) };
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Maps API key not configured' }) };
    }

    const avoid = avoidTolls ? '&avoid=tolls' : '';
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=driving${avoid}&key=${apiKey}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== 'OK') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `Could not find route. Check the addresses and try again. (${data.status})` })
      };
    }

    const leg = data.routes[0].legs[0];
    const durationMinutes = Math.ceil(leg.duration.value / 60);
    const distanceMiles = (leg.distance.value * 0.000621371).toFixed(1);
    const polyline = data.routes[0].overview_polyline.points;

    // Fetch static map image and return as base64 so the API key never hits the browser
    let mapImageDataUrl = null;
    try {
      const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?size=600x300&scale=2&path=color:0x1e3a5fff|weight:5|enc:${encodeURIComponent(polyline)}&markers=color:green|label:A|${encodeURIComponent(origin)}&markers=color:red|label:B|${encodeURIComponent(destination)}&key=${apiKey}`;
      const mapRes = await fetch(mapUrl);
      if (mapRes.ok) {
        const buffer = await mapRes.arrayBuffer();
        mapImageDataUrl = `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`;
      }
    } catch (e) {
      console.warn('tcq-directions: static map fetch failed:', e.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        durationMinutes,
        distanceMiles,
        summary: data.routes[0].summary,
        durationText: leg.duration.text,
        distanceText: leg.distance.text,
        mapImageDataUrl
      })
    };

  } catch (err) {
    console.error('tcq-directions error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error: ' + err.message })
    };
  }
};
