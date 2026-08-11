/**
 * Extrae datos de la placa de un montacargas usando Google Gemini AI vision.
 * Recibe una imagen en base64 y devuelve los campos estructurados.
 *
 * Gemini puede leer texto en chino, inglés y español, incluso si la foto
 * está rotada o tiene glare — mucho mejor que OCR tradicional (Tesseract).
 */

const SYSTEM_PROMPT = `You are an expert at reading forklift data plates (specification plates / nameplates).
You receive a photo of a forklift specification plate and must extract the following fields.
The plate may be in English, Spanish, Chinese, or any combination.
The photo may be rotated — always consider all orientations.

Extract these fields (return null if not clearly visible):
- brand: Manufacturer brand name (e.g., HELI, Toyota, CAT, Mitsubishi, Hyster, Yale, Komatsu, Nissan, TCM, Doosan, Clark, Crown, Jungheinrich, Still, Linde, EP, Hangcha, Lonking, Anhui). Match closely even if OCR would fail.
- model: Model / Configuration Number / Type designation (string, short)
- serialNumber: Serial number / S/N (string)
- capacity: Rated lifting capacity (number only, no units)
- capacityUnit: Unit for capacity (KG, LBS, or TON)
- powerType: Power source. Translate to Spanish: "Eléctrico", "Diesel", "Gasolina", "GLP", "Combustión interna", or "Híbrido"
- mastType: Mast type. Translate to Spanish: "Simple", "Dúplex", "Tríplex", or "Quádruple"
- maxLiftHeight: Maximum lift height (number only)
- tireType: Tire type. Translate to Spanish: "Neumáticas", "Sólidas", or "Poliuretano"
- manufactureYear: Year of manufacture (4 digits as string)
- voltage: Voltage if electric (number only as string)
- weight: Equipment weight / Device weight (number only, no units)

IMPORTANT: Return ONLY valid JSON (no markdown, no code fences, no explanation).
Example: {"brand":"HELI","model":"CPD35","serialNumber":null,"capacity":"3500","capacityUnit":"KG","powerType":"Eléctrico","mastType":null,"maxLiftHeight":null,"tireType":null,"manufactureYear":"2023","voltage":"48","weight":"4920"}`;

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const body = await req.json();
    const { image, mimeType } = body;

    if (!image) {
      return new Response(JSON.stringify({ error: 'No image provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Call Google Gemini API (gemini-flash-lite-latest — fast, no reasoning overhead, supports vision)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${geminiKey}`;

    const geminiBody = {
      contents: [{
        parts: [
          { text: SYSTEM_PROMPT },
          {
            inline_data: {
              mime_type: mimeType || 'image/jpeg',
              data: image,
            },
          },
        ],
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 1500,
      },
    };

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error('Gemini API error:', geminiResponse.status, errText);
      return new Response(JSON.stringify({ error: 'Gemini API failed', details: errText }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const geminiData = await geminiResponse.json();
    const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!content) {
      return new Response(JSON.stringify({ error: 'Empty AI response' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Parse the JSON from the AI response — strip markdown code fences if present
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // Try to find JSON object in the text
      const match = jsonStr.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error('Could not parse AI response as JSON: ' + content.substring(0, 200));
      }
    }

    // Clean up: ensure all null or string values
    const cleanData = {
      brand: parsed.brand || null,
      model: parsed.model || null,
      serialNumber: parsed.serialNumber || null,
      capacity: parsed.capacity ? String(parsed.capacity) : null,
      capacityUnit: parsed.capacityUnit || null,
      powerType: parsed.powerType || null,
      mastType: parsed.mastType || null,
      maxLiftHeight: parsed.maxLiftHeight ? String(parsed.maxLiftHeight) : null,
      tireType: parsed.tireType || null,
      manufactureYear: parsed.manufactureYear || null,
      voltage: parsed.voltage ? String(parsed.voltage) : null,
      weight: parsed.weight ? String(parsed.weight) : null,
    };

    const foundCount = Object.values(cleanData).filter((v) => v !== null).length;

    return new Response(
      JSON.stringify({ success: true, data: cleanData, foundCount }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error) {
    console.error('extractForkliftPlateData error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});
