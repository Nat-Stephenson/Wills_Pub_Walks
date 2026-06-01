export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { coordinates } = req.body;

  if (!coordinates || !Array.isArray(coordinates)) {
    return res.status(400).json({ error: 'Missing or invalid coordinates' });
  }

  try {
    const orsRes = await fetch('https://api.openrouteservice.org/v2/directions/foot-walking', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': process.env.OPENROUTESERVICE_API_KEY
      },
      body: JSON.stringify({ coordinates })
    });

    const data = await orsRes.json();
    res.status(orsRes.status).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Proxy error', details: error.message });
  }
}
