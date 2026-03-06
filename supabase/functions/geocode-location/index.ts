import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { city, country } = await req.json()

    if (!city || !country) {
      return new Response(
        JSON.stringify({ error: 'Ciudad y país son requeridos' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get Mapbox token from secrets
    const mapboxToken = Deno.env.get('MAPBOX_PUBLIC_TOKEN')
    if (!mapboxToken) {
      return new Response(
        JSON.stringify({ error: 'Token de Mapbox no configurado' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Build search query
    const searchQuery = `${city}, ${country}`
    const encodedQuery = encodeURIComponent(searchQuery)

    // Call Mapbox Geocoding API
    const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?access_token=${mapboxToken}&limit=1&types=place`
    
    const response = await fetch(mapboxUrl)
    const data = await response.json()

    if (!response.ok) {
      throw new Error(`Mapbox API error: ${data.message || 'Error desconocido'}`)
    }

    if (!data.features || data.features.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No se encontraron coordenadas para esta ubicación' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const feature = data.features[0]
    const [longitude, latitude] = feature.center

    return new Response(
      JSON.stringify({
        coordinates: `${latitude},${longitude}`,
        place_name: feature.place_name
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Geocoding error:', error)
    return new Response(
      JSON.stringify({ error: 'Error al obtener coordenadas' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})