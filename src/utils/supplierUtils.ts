import type { Propuesta, PropuestasResponse } from '@/types/chat';

export interface Supplier {
  name: string;
  country: string;
  flag?: string;
  capability: string;
  score: number;
  placeholder?: boolean;
}

export function randomScore(): number {
  return 80 + Math.floor(Math.random() * 20); // 80-99
}

const placeholderNames = [
  "Placeholder Vision Co.",
  "Demo Systems Ltd.",
  "Sample Tech Inc.",
  "Example Industries",
  "Mock Solutions GmbH"
];

const placeholderCountries = [
  { name: "Germany", flag: "🇩🇪" },
  { name: "USA", flag: "🇺🇸" },
  { name: "Japan", flag: "🇯🇵" },
  { name: "UK", flag: "🇬🇧" },
  { name: "Canada", flag: "🇨🇦" }
];

export function fillPlaceholders(suppliers: Supplier[], targetCount: number = 5): Supplier[] {
  const filledSuppliers = [...suppliers];
  
  while (filledSuppliers.length < targetCount) {
    const index = filledSuppliers.length;
    const countryData = placeholderCountries[index % placeholderCountries.length];
    
    filledSuppliers.push({
      name: placeholderNames[index % placeholderNames.length],
      country: countryData.name,
      flag: countryData.flag,
      capability: "Placeholder supplier for demonstration purposes. Real supplier data coming soon.",
      score: randomScore(),
      placeholder: true
    });
  }
  
  return filledSuppliers;
}

// Nueva función para parsear propuestas del JSON
export function parsePropuestasFromContent(content: string): Propuesta[] {
  try {
    // Verificar que content sea una cadena
    if (typeof content !== 'string') {
      console.warn('parsePropuestasFromContent: content is not a string:', typeof content, content);
      return [];
    }
    
    let jsonString = '';
    // Patrón 1: JSON en bloques de código markdown (tolerante a saltos de línea y espacios)
    const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      jsonString = jsonBlockMatch[1];
    }
    // Patrón 2: JSON sin bloques de código pero con estructura clara
    if (!jsonString) {
      const jsonMatch = content.match(/\{\s*"propuestas"\s*:\s*\[[\s\S]*?\]\s*\}/);
      if (jsonMatch) {
        jsonString = jsonMatch[0];
      }
    }
    // Patrón 3: Buscar desde "propuestas" hasta el final del JSON
    if (!jsonString) {
      const propuestasIndex = content.indexOf('"propuestas"');
      if (propuestasIndex !== -1) {
        const startIndex = content.lastIndexOf('{', propuestasIndex);
        if (startIndex !== -1) {
          let braceCount = 0;
          let endIndex = startIndex;
          for (let i = startIndex; i < content.length; i++) {
            if (content[i] === '{') braceCount++;
            if (content[i] === '}') {
              braceCount--;
              if (braceCount === 0) {
                endIndex = i;
                break;
              }
            }
          }
          if (endIndex > startIndex) {
            jsonString = content.substring(startIndex, endIndex + 1);
          
          }
        }
      } 
    }
    // Patrón 4: Buscar cualquier objeto que contenga "propuestas"
    if (!jsonString) {
      const anyJsonMatch = content.match(/\{[\s\S]*?"propuestas"[\s\S]*?\}/);
      if (anyJsonMatch) {
        jsonString = anyJsonMatch[0];
      }
    }
    if (jsonString) {
      try {
        const data: PropuestasResponse = JSON.parse(jsonString);
        return data.propuestas || [];
      } catch (e) {
        console.error('[DEBUG][parser] Error al hacer JSON.parse:', e, jsonString);
        return [];
      }
    }
    return [];
  } catch (error) {
    console.error('Error parsing propuestas:', error);
    console.error('Contenido que causó el error:', content);
    return [];
  }
}

export function parseAssistantMessage(content: string) {
  // Verificar que content sea una cadena
  if (typeof content !== 'string') {
    console.warn('parseAssistantMessage: content is not a string:', typeof content, content);
    return {
      specifications: [],
      questions: [],
      suppliers: {
        hardware: [],
        integrators: [],
        software: [],
        consulting: []
      },
      propuestas: [],
      beforeJson: '',
      afterJson: ''
    };
  }

  const sections = {
    specifications: [] as string[],
    questions: [] as string[],
    suppliers: {
      hardware: [] as Supplier[],
      integrators: [] as Supplier[],
      software: [] as Supplier[],
      consulting: [] as Supplier[]
    },
    propuestas: [] as Propuesta[]
  };

  // Primero intentar parsear propuestas del JSON
  const propuestas = parsePropuestasFromContent(content);
  if (propuestas.length > 0) {
    sections.propuestas = propuestas;
  }

  // Extraer las tres partes del contenido
  let beforeJson = '';
  let afterJson = '';
  
  // Buscar el JSON en el contenido
  const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonMatch = content.match(/\{\s*"propuestas"\s*:\s*\[[\s\S]*?\]\s*\}/);
  const anyJsonMatch = content.match(/\{[\s\S]*?"propuestas"[\s\S]*?\}/);
  
  let jsonStart = -1;
  let jsonEnd = -1;
  
  if (jsonBlockMatch) {
    // JSON en bloque de código
    jsonStart = content.indexOf('```json');
    jsonEnd = content.indexOf('```', jsonStart + 7) + 3;
  } else if (jsonMatch) {
    // JSON suelto
    jsonStart = content.indexOf(jsonMatch[0]);
    jsonEnd = jsonStart + jsonMatch[0].length;
  } else if (anyJsonMatch) {
    // Cualquier JSON con propuestas
    jsonStart = content.indexOf(anyJsonMatch[0]);
    jsonEnd = jsonStart + anyJsonMatch[0].length;
  }
  
  if (jsonStart !== -1 && jsonEnd !== -1) {
    // Extraer texto antes del JSON
    beforeJson = content.substring(0, jsonStart).trim();
    
    // Extraer texto después del JSON
    afterJson = content.substring(jsonEnd).trim();
  } else {
    // Si no hay JSON, todo el contenido va en beforeJson
    beforeJson = content.trim();
  }

  // Limpiar líneas vacías múltiples
  beforeJson = beforeJson.replace(/\n\s*\n\s*\n/g, '\n\n');
  afterJson = afterJson.replace(/\n\s*\n\s*\n/g, '\n\n');

  // Split content by headers (solo para el contenido antes del JSON)
  const parts = beforeJson.split(/(?=##\s|\*\*[A-Z])/);
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.includes('Generated Specifications') || trimmed.includes('Specifications')) {
      const bullets = trimmed.split('\n').filter(line => line.trim().startsWith('•') || line.trim().startsWith('-'));
      sections.specifications = bullets.map(bullet => bullet.replace(/^[•\-\s]+/, ''));
    }
    
    else if (trimmed.includes('Key follow-up questions') || trimmed.includes('questions')) {
      const questions = trimmed.split('\n').filter(line => /^\d+\./.test(line.trim()));
      sections.questions = questions.map(q => q.replace(/^\d+\.\s*/, ''));
    }
    
    else if (trimmed.includes('Vision Hardware') || trimmed.includes('Hardware')) {
      sections.suppliers.hardware = extractSuppliers(trimmed);
    }
    
    else if (trimmed.includes('Integrators') || trimmed.includes('Turn-key')) {
      sections.suppliers.integrators = extractSuppliers(trimmed);
    }
    
    else if (trimmed.includes('AI Software') || trimmed.includes('Software')) {
      sections.suppliers.software = extractSuppliers(trimmed);
    }
    
    else if (trimmed.includes('Consulting') || trimmed.includes('Services')) {
      sections.suppliers.consulting = extractSuppliers(trimmed);
    }
  }

  return {
    ...sections,
    beforeJson,
    afterJson
  };
}

function extractSuppliers(text: string): Supplier[] {
  const lines = text.split('\n').filter(line => line.trim());
  const suppliers: Supplier[] = [];
  
  for (const line of lines) {
    // Look for lines that might contain supplier info
    if (line.includes('|') || line.match(/\d+%/)) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 3) {
        const name = parts[0].replace(/^[•\-\s]+/, '');
        const country = parts[1];
        const capability = parts[2];
        
        if (name && country && capability) {
          suppliers.push({
            name,
            country,
            capability,
            score: randomScore(),
            flag: getCountryFlag(country)
          });
        }
      }
    }
  }
  
  return suppliers;
}

function getCountryFlag(country: string): string {
  const flagMap: { [key: string]: string } = {
    'germany': '🇩🇪', 'usa': '🇺🇸', 'japan': '🇯🇵', 'uk': '🇬🇧', 
    'canada': '🇨🇦', 'france': '🇫🇷', 'italy': '🇮🇹', 'sweden': '🇸🇪'
  };
  
  return flagMap[country.toLowerCase()] || '🏭';
}
