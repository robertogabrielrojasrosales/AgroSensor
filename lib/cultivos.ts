// Cultivos sugeridos al registrar una parcela (solo nombres). El campo también acepta texto libre.
export type CultivoGroup = { value: string; items: string[] }

export const CULTIVO_GROUPS: CultivoGroup[] = [
  {
    value: 'Hortalizas y cultivos intensivos',
    items: [
      'Tomate',
      'Espárrago',
      'Ají / Pimiento',
      'Lechuga',
      'Brócoli / Coliflor',
      'Pepino',
      'Zapallo / Calabaza',
      'Alcachofa',
      'Apio',
      'Espinaca',
    ],
  },
  {
    value: 'Tubérculos, raíces y bulbos',
    items: [
      'Papa',
      'Camote',
      'Yuca',
      'Cebolla',
      'Ajo',
      'Zanahoria',
      'Betarraga (remolacha)',
      'Jengibre (kion)',
    ],
  },
  {
    value: 'Berries y frutales de clima templado',
    items: [
      'Fresa',
      'Arándano',
      'Frambuesa / Mora',
      'Kiwi',
      'Manzana',
      'Durazno / Melocotón',
      'Pera',
      'Uva (vid)',
    ],
  },
  {
    value: 'Frutales tropicales, cítricos y agroindustriales',
    items: [
      'Banano / Plátano',
      'Maracuyá',
      'Papaya',
      'Palta (aguacate)',
      'Limón / Cítricos (naranja, mandarina)',
      'Mango',
      'Piña',
      'Sandía / Melón',
      'Granadilla / Chirimoya',
      'Lúcuma',
      'Olivo (aceituna)',
      'Caña de azúcar',
      'Café',
      'Cacao',
    ],
  },
  {
    value: 'Cereales, leguminosas, aromáticas y zonas áridas',
    items: [
      'Maíz',
      'Arroz (bajo riego controlado)',
      'Trigo / Cebada',
      'Quinua',
      'Frijol / Pallar / Lenteja',
      'Alfalfa',
      'Algodón',
      'Orégano / Albahaca / Hierbabuena',
      'Pitahaya',
      'Tuna (nopal)',
    ],
  },
  {
    value: 'Frutos secos y oleaginosas',
    items: [
      'Maní / Cacahuate',
      'Pistacho',
      'Almendra',
      'Nuez (nogal)',
      'Pecana',
      'Avellana',
      'Marañón / Anacardo',
      'Girasol',
    ],
  },
]

const EMOJI_POR_CULTIVO: Array<[palabras: string[], emoji: string]> = [
  [['tomate'], '🍅'],
  [['esparrago'], '🌿'],
  [['aji', 'pimiento', 'rocoto'], '🌶️'],
  [['lechuga', 'apio', 'espinaca'], '🥬'],
  [['brocoli', 'coliflor'], '🥦'],
  [['pepino', 'pepinillo'], '🥒'],
  [['zapallo', 'calabaza'], '🎃'],
  [['alcachofa', 'oregano', 'albahaca', 'hierbabuena', 'alfalfa', 'algodon'], '🌿'],
  [['papa'], '🥔'],
  [['camote', 'yuca'], '🍠'],
  [['cebolla'], '🧅'],
  [['ajo'], '🧄'],
  [['zanahoria', 'betarraga', 'remolacha'], '🥕'],
  [['jengibre', 'kion'], '🌿'],
  [['fresa', 'frambuesa', 'mora'], '🍓'],
  [['arandano'], '🫐'],
  [['kiwi'], '🥝'],
  [['manzana'], '🍎'],
  [['durazno', 'melocoton'], '🍑'],
  [['pera'], '🍐'],
  [['uva', 'vid'], '🍇'],
  [['banano', 'platano'], '🍌'],
  [['maracuya', 'granadilla', 'chirimoya'], '🍈'],
  [['papaya', 'pitahaya'], '🍈'],
  [['palta', 'aguacate'], '🥑'],
  [['limon', 'citrico', 'naranja', 'mandarina', 'lucuma'], '🍋'],
  [['mango'], '🥭'],
  [['pina'], '🍍'],
  [['sandia', 'melon'], '🍉'],
  [['olivo', 'aceituna'], '🫒'],
  [['cana de azucar', 'arroz', 'trigo', 'cebada', 'quinua'], '🌾'],
  [['cafe'], '☕'],
  [['cacao'], '🍫'],
  [['maiz'], '🌽'],
  [['frijol', 'pallar', 'lenteja'], '🫘'],
  [['tuna', 'nopal'], '🌵'],
  [['mani', 'cacahuate', 'maranon', 'anacardo'], '🥜'],
  [['pistacho', 'almendra', 'nuez', 'nogal', 'pecana', 'avellana'], '🌰'],
  [['girasol'], '🌻'],
]

function sinTildes(texto: string) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Emoji a color del cultivo (reconoce nombres de la lista o texto libre); 🌱 si no se reconoce. */
export function emojiDeCultivo(cultivo: string) {
  const texto = sinTildes(cultivo)
  for (const [palabras, emoji] of EMOJI_POR_CULTIVO) {
    if (palabras.some((palabra) => new RegExp(`(^|[^a-z])${palabra}([^a-z]|$)`).test(texto))) return emoji
  }
  return '🌱'
}
