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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        durationMinutes,
        distanceMiles,
        summary: data.routes[0].summary,
        durationText: leg.duration.text,
        distanceText: leg.distance.text
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
