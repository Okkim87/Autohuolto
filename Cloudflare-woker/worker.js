
const PLAN = {
  single: {
    label: '1 diagnoosi',
    credits: 30,
    expiresDays: 90
  },
  five: {
    label: '5 diagnoosia',
    credits: 150,
    expiresDays: 180
  },
  month: {
    label: '30 päivän käyttö',
    credits: 300,
    expiresDays: 30
  }
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    if (request.method !== 'POST') {
      return json(
        { error: 'Method not allowed' },
        405,
        headers
      );
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === '/activate') {
        return await activate(request, env, headers);
      }

      if (url.pathname === '/lookup') {
        return await lookup(request, env, headers);
      }

      if (url.pathname === '/diagnose') {
        return await diagnose(request, env, headers);
      }

      if (url.pathname === '/admin/create-code') {
        return await createCode(request, env, headers);
      }

      return json(
        { error: 'Not found' },
        404,
        headers
      );

    } catch (e) {
      console.error(e);

      return json({
        error: 'Palvelinvirhe. Yritä uudelleen.'
      }, 500, headers);
    }
  }
};

function corsHeaders(origin, allowed) {
  const allow =
    !allowed || origin === allowed
      ? (origin || allowed || '*')
      : allowed;

  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization',
    'Access-Control-Allow-Methods':
      'POST, OPTIONS',
    'Content-Type':
      'application/json; charset=utf-8'
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(
    JSON.stringify(data),
    { status, headers }
  );
}

function cleanCode(value = '') {
  return String(value).trim().toUpperCase();
}

function cleanVin(value = '') {
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-HJ-NPR-Z0-9*]/g, '')
    .slice(0, 17);
}

function remainingText(rec) {
  const credits = Math.max(0, rec.credits || 0);

  const expires = rec.expiresAt
    ? new Date(rec.expiresAt).toLocaleDateString('fi-FI')
    : '';

  return (
    `${credits} AI-vaihetta jäljellä` +
    (expires ? ` · voimassa ${expires} asti` : '')
  );
}

class UserError extends Error {}

async function getRecord(env, code) {
  const rec = await env.ACCESS_CODES.get(
    `code:${code}`,
    'json'
  );

  if (!rec) {
    throw new UserError(
      'Aktivointikoodia ei löytynyt.'
    );
  }

  if (rec.disabled) {
    throw new UserError(
      'Aktivointikoodi ei ole käytössä.'
    );
  }

  if (rec.expiresAt && Date.now() > rec.expiresAt) {
    throw new UserError(
      'Aktivointikoodi on vanhentunut.'
    );
  }

  if ((rec.credits || 0) <= 0) {
    throw new UserError(
      'Aktivointikoodin käyttömäärä on käytetty loppuun.'
    );
  }

  return rec;
}

// Korkeajännitejärjestelmät on rajattu pois palvelusta.

function isHighVoltageTopic(c = {}, text = '') {
  const hay = [
    c.car,
    c.engine,
    c.dtc,
    text
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return /(?:\bhv\b|high[- ]?voltage|korkeajänn\w*|ajoakku\w*|traction battery|hybridiakku\w*|hybrid battery|service disconnect|huoltoerotin\w*|interlock|precharge|esilataus\w*|kontaktori\w*|contactor|invertteri\w*|inverter|on[- ]?board charger|\bobc\b|dc[-/]?dc|oranssi\w*\s+kaapeli\w*|eristysvi\w*|isolation fault|\bp0aa[0-9a-f]\b|\bp1a[0-9a-f]{2}\b)/i.test(hay);
}

function attachmentMentionsHighVoltage(attachments = []) {
  return attachments.some(a => {
    const content = a.kind === 'text'
      ? `${a.name || ''} ${a.text || ''}`
      : a.name || '';

    return isHighVoltageTopic({}, content);
  });
}

function hvRedirectReply() {
  return {
    blocked: true,
    test: 'Korkeajännitejärjestelmä',
    tool: '',
    how:
      'Autosähköapu AI ei anna korkeajännitejärjestelmän mittaus-, korjaus- tai purkuohjeita. Ota tässä asiassa suoraan yhteyttä minuun: autosahkoapu@gmail.com',
    expected: '',
    ifNormal: '',
    ifAbnormal: '',
    reason:
      'Korkeajännitejärjestelmään liittyvät työt vaativat erillisen turvallisen menettelyn ja asianmukaisen osaamisen.',
    caution:
      'Korkeajännitejärjestelmiin liittyvät mittaukset ja korjaukset vaativat asianmukaisen koulutuksen ja turvalliset työmenetelmät.'
  };
}

// Käyttöoikeuden tarkistus.

async function activate(request, env, headers) {
  try {
    const { code } = await request.json();

    const cleaned = cleanCode(code);
    const rec = await getRecord(env, cleaned);

    return json({
      ok: true,
      label: rec.label,
      credits: rec.credits,
      expiresAt: rec.expiresAt,
      remainingText: remainingText(rec)
    }, 200, headers);

  } catch (e) {
    return json({
      error:
        e instanceof UserError
          ? e.message
          : 'Virheellinen pyyntö.'
    }, 400, headers);
  }
}

// Erillinen tietohaku.

async function lookup(request, env, headers) {
  const body = await request.json();

  const prepared = prepareConversation(
    body.caseData || {},
    body.history || [],
    body.userMessage || ''
  );

  const context = await getTechnicalContext(
    prepared.caseData,
    env
  );

  return json({
    context,
    sources: sourceSummary(context)
  }, 200, headers);
}

// Varsinainen AI-diagnoosi.

async function diagnose(request, env, headers) {
  try {
    const body = await request.json();

    const code = cleanCode(body.code);
    const rec = await getRecord(env, code);

    const userMessage = String(
      body.userMessage ||
      body.measurementResult ||
      ''
    ).slice(0, 5000);

    const attachments = normalizeAttachments(
      body.attachments
    );

    const prepared = prepareConversation(
      body.caseData || {},
      body.history || [],
      userMessage
    );

    const caseData = prepared.caseData;
    const history = prepared.history;

    const compactFiles = attachments.map(a => ({
      name: a.name,
      kind: a.kind
    }));

    if (
      isHighVoltageTopic(caseData, userMessage) ||
      attachmentMentionsHighVoltage(attachments)
    ) {
      const reply = hvRedirectReply();

      const nextHistory = [
        ...history,
        {
          role: 'user',
          text: userMessage,
          attachments: compactFiles
        },
        {
          role: 'assistant',
          reply
        }
      ].slice(-18);

      return json({
        reply,
        history: nextHistory,
        access: {
          credits: rec.credits,
          remainingText: remainingText(rec)
        },
        sources: []
      }, 200, headers);
    }

    const technicalContext =
      await getTechnicalContext(caseData, env);

    const prompt = buildPrompt(
      caseData,
      history,
      userMessage,
      technicalContext,
      attachments
    );

    const userContent = [
      {
        type: 'input_text',
        text: prompt
      }
    ];

    for (const a of attachments) {
      if (a.kind === 'image' && a.dataUrl) {
        userContent.push({
          type: 'input_image',
          image_url: a.dataUrl
        });
      }
    }

    const response = await fetch(
      'https://api.openai.com/v1/responses',
      {
        method: 'POST',
        headers: {
          Authorization:
            `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model:
            env.OPENAI_MODEL || 'gpt-5.6-luna',
          reasoning: {
            effort: 'low'
          },
          max_output_tokens: 1100,
          input: [
            {
              role: 'system',
              content: [
                {
                  type: 'input_text',
                  text: SYSTEM_PROMPT
                }
              ]
            },
            {
              role: 'user',
              content: userContent
            }
          ]
        })
      }
    );

    const raw = await response.json();

    if (!response.ok) {
      console.error('OpenAI error', raw);

      throw new Error(
        'AI-palvelu ei vastannut.'
      );
    }

    const responseText = extractText(raw);
    const reply = parseReply(responseText);

    if (!reply.blocked) {
      rec.credits = Math.max(
        0,
        (rec.credits || 0) - 1
      );

      rec.used = (rec.used || 0) + 1;
      rec.lastUsedAt = Date.now();

      await env.ACCESS_CODES.put(
        `code:${code}`,
        JSON.stringify(rec)
      );
    }

    const nextHistory = [
      ...history,
      {
        role: 'user',
        text: userMessage,
        attachments: compactFiles
      },
      {
        role: 'assistant',
        reply
      }
    ].slice(-18);

    return json({
      reply,
      history: nextHistory,
      access: {
        credits: rec.credits,
        remainingText: remainingText(rec)
      },
      sources: sourceSummary(technicalContext)
    }, 200, headers);

  } catch (e) {
    if (e instanceof UserError) {
      return json({
        error: e.message
      }, 402, headers);
    }

    console.error(e);

    return json({
      error:
        'AI-diagnoosi epäonnistui. Yritä uudelleen.'
    }, 500, headers);
  }
}

// Liitteiden käsittely.

function normalizeAttachments(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  const out = [];

  for (const x of raw.slice(0, 6)) {
    const name = String(
      x?.name || 'liite'
    ).slice(0, 120);

    if (
      x?.kind === 'image' &&
      typeof x.dataUrl === 'string' &&
      /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(
        x.dataUrl
      ) &&
      x.dataUrl.length < 6_000_000
    ) {
      out.push({
        name,
        kind: 'image',
        dataUrl: x.dataUrl
      });

      continue;
    }

    if (
      x?.kind === 'text' &&
      typeof x.text === 'string'
    ) {
      out.push({
        name,
        kind: 'text',
        text: x.text.slice(0, 80000)
      });
    }
  }

  return out;
}

// Keskustelun tapaustiedot.
//
// Selvästi eri automalliin vaihtaminen aloittaa uuden tapauksen.
// Saman auton uudet oireet eivät tyhjennä keskusteluhistoriaa.

function prepareConversation(
  rawCase = {},
  rawHistory = [],
  userMessage = ''
) {
  const history = Array.isArray(rawHistory)
    ? rawHistory.slice(-18)
    : [];

  const mentionedVehicle = findVehicleFromText(
    userMessage
  );

  const oldVehicle = findVehicleFromText(
    String(rawCase.car || '')
  );

  const oldMake = normalizeVehicleName(
    rawCase.make ||
    oldVehicle.make ||
    ''
  );

  const oldModel = normalizeVehicleName(
    rawCase.model ||
    oldVehicle.model ||
    ''
  );

  const newMake = normalizeVehicleName(
    mentionedVehicle.make || ''
  );

  const newModel = normalizeVehicleName(
    mentionedVehicle.model || ''
  );

  const explicitlyDifferentVehicle =
    Boolean(
      newModel &&
      oldModel &&
      newModel !== oldModel
    ) ||
    Boolean(
      newMake &&
      oldMake &&
      newMake !== oldMake
    );

  if (explicitlyDifferentVehicle) {
    const freshCase = {
      ...rawCase,
      car: mentionedVehicle.car,
      make: mentionedVehicle.make,
      model: mentionedVehicle.model,
      year: extractYear(userMessage),
      engine: extractEngine(userMessage),
      dtc: parseDtcCodes(userMessage).join(', '),
      vin: '',
      tools: Array.isArray(rawCase.tools)
        ? rawCase.tools
        : [],
      mode: rawCase.mode || 'consumer'
    };

    return {
      caseData: enrichCaseData(
        freshCase,
        [],
        userMessage
      ),
      history: [],
      newCase: true
    };
  }

  return {
    caseData: enrichCaseData(
      rawCase,
      history,
      userMessage
    ),
    history,
    newCase: false
  };
}

function normalizeVehicleName(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function parseDtcCodes(raw = '') {
  const found = String(raw)
    .toUpperCase()
    .match(/\b[PBCU][0-9A-F]{4}\b/g) || [];

  return [...new Set(found)].slice(0, 12);
}

const VEHICLE_MODELS = [
  ['Ford', 'Mondeo', ['mondeo']],
  ['Ford', 'Focus', ['focus']],
  ['Ford', 'Fiesta', ['fiesta']],
  ['Ford', 'S-Max', ['s-max', 's max', 'smax']],
  ['Ford', 'Kuga', ['kuga']],
  ['Ford', 'Transit', ['transit']],
  ['Ford', 'Mustang Mach-E', ['mach-e', 'mach e']],

  ['Volkswagen', 'Golf', ['golf']],
  ['Volkswagen', 'Passat', ['passat']],
  ['Volkswagen', 'Polo', ['polo']],
  ['Volkswagen', 'Tiguan', ['tiguan']],
  ['Volkswagen', 'Touareg', ['touareg']],
  ['Volkswagen', 'Transporter', ['transporter']],
  ['Volkswagen', 'ID.3', ['id.3', 'id3']],
  ['Volkswagen', 'ID.4', ['id.4', 'id4']],

  ['Toyota', 'Yaris', ['yaris']],
  ['Toyota', 'Corolla', ['corolla']],
  ['Toyota', 'Avensis', ['avensis']],
  ['Toyota', 'Auris', ['auris']],
  ['Toyota', 'Prius', ['prius']],
  ['Toyota', 'RAV4', ['rav4', 'rav 4']],
  ['Toyota', 'C-HR', ['c-hr', 'chr']],

  ['Skoda', 'Octavia', ['octavia']],
  ['Skoda', 'Superb', ['superb']],
  ['Skoda', 'Fabia', ['fabia']],
  ['Skoda', 'Kodiaq', ['kodiaq']],
  ['Skoda', 'Karoq', ['karoq']],

  ['Volvo', 'V40', ['v40']],
  ['Volvo', 'V50', ['v50']],
  ['Volvo', 'V60', ['v60']],
  ['Volvo', 'V70', ['v70']],
  ['Volvo', 'V90', ['v90']],
  ['Volvo', 'XC40', ['xc40']],
  ['Volvo', 'XC60', ['xc60']],
  ['Volvo', 'XC90', ['xc90']],

  ['Audi', 'A3', ['a3']],
  ['Audi', 'A4', ['a4']],
  ['Audi', 'A5', ['a5']],
  ['Audi', 'A6', ['a6']],
  ['Audi', 'Q3', ['q3']],
  ['Audi', 'Q5', ['q5']],
  ['Audi', 'Q7', ['q7']],

  ['Nissan', 'Qashqai', ['qashqai']],
  ['Nissan', 'Juke', ['juke']],
  ['Nissan', 'Leaf', ['leaf']],
  ['Nissan', 'X-Trail', ['x-trail', 'x trail']],

  ['Opel', 'Astra', ['astra']],
  ['Opel', 'Insignia', ['insignia']],
  ['Opel', 'Corsa', ['corsa']],
  ['Opel', 'Vectra', ['vectra']],
  ['Opel', 'Zafira', ['zafira']],
  ['Opel', 'Ampera', ['ampera']],

  ['Hyundai', 'i20', ['i20']],
  ['Hyundai', 'i30', ['i30']],
  ['Hyundai', 'Ioniq', ['ioniq']],
  ['Hyundai', 'Ioniq 5', ['ioniq 5']],
  ['Hyundai', 'Tucson', ['tucson']],
  ['Hyundai', 'Kona', ['kona']],

  ['Kia', 'Ceed', ['ceed', "cee'd"]],
  ['Kia', 'Rio', ['rio']],
  ['Kia', 'Sportage', ['sportage']],
  ['Kia', 'Sorento', ['sorento']],
  ['Kia', 'Niro', ['niro']],
  ['Kia', 'EV6', ['ev6']],

  ['Peugeot', '308', ['308']],
  ['Peugeot', '3008', ['3008']],
  ['Peugeot', '508', ['508']],
  ['Peugeot', '2008', ['2008']],

  ['Renault', 'Clio', ['clio']],
  ['Renault', 'Megane', ['megane', 'mégane']],
  ['Renault', 'Captur', ['captur']],
  ['Renault', 'Kadjar', ['kadjar']],

  ['Mazda', 'Mazda 3', ['mazda 3', 'mazda3']],
  ['Mazda', 'Mazda 6', ['mazda 6', 'mazda6']],
  ['Mazda', 'CX-5', ['cx-5', 'cx5']],

  ['Honda', 'Civic', ['civic']],
  ['Honda', 'Accord', ['accord']],
  ['Honda', 'CR-V', ['cr-v', 'crv']],

  ['Mitsubishi', 'Outlander', ['outlander']],
  ['Mitsubishi', 'ASX', ['asx']],

  ['Subaru', 'Outback', ['outback']],
  ['Subaru', 'Forester', ['forester']],
  ['Subaru', 'Impreza', ['impreza']]
];

const VEHICLE_MAKES = [
  'Ford',
  'Volkswagen',
  'VW',
  'Toyota',
  'Skoda',
  'Škoda',
  'Volvo',
  'Audi',
  'BMW',
  'Mercedes-Benz',
  'Mercedes',
  'Nissan',
  'Opel',
  'Hyundai',
  'Kia',
  'Peugeot',
  'Renault',
  'Mazda',
  'Honda',
  'Mitsubishi',
  'Subaru',
  'Citroen',
  'Citroën',
  'Seat',
  'SEAT',
  'Cupra',
  'Fiat',
  'Saab',
  'Lexus',
  'Suzuki',
  'Dacia',
  'Tesla',
  'Polestar',
  'BYD',
  'MG'
];

function escapeRe(value = '') {
  return String(value)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function recentUserText(
  history = [],
  userMessage = ''
) {
  const parts = [];

  for (const item of history.slice(-12)) {
    if (item?.role === 'user' && item.text) {
      parts.push(String(item.text));
    }
  }

  if (userMessage) {
    parts.push(String(userMessage));
  }

  return parts.join(' \n ').slice(-18000);
}

function findVehicleFromText(text = '') {
  const source = String(text);
  const lower = source.toLowerCase();

  const models = [...VEHICLE_MODELS].sort(
    (a, b) =>
      Math.max(...b[2].map(x => x.length)) -
      Math.max(...a[2].map(x => x.length))
  );

  for (const [make, model, aliases] of models) {
    if (
      aliases.some(alias =>
        new RegExp(
          `(^|[^a-z0-9])${escapeRe(alias)}([^a-z0-9]|$)`,
          'i'
        ).test(lower)
      )
    ) {
      return {
        make,
        model,
        car: `${make} ${model}`
      };
    }
  }

  const bmw = lower.match(
    /\b(?:bmw\s*)?((?:[1-8][0-9]{2}[dix]?)|x[1-7]|i[3478])\b/i
  );

  if (
    bmw &&
    (
      /\bbmw\b/i.test(source) ||
      /\b[1-8][0-9]{2}[dix]?\b/i.test(source)
    )
  ) {
    return {
      make: 'BMW',
      model: bmw[1].toUpperCase(),
      car: `BMW ${bmw[1].toUpperCase()}`
    };
  }

  const merc = source.match(
    /\b(?:mercedes(?:-benz)?|mb)\s+([acegsv][ -]?[0-9]{2,3}[a-z0-9-]*)\b/i
  );

  if (merc) {
    const model = merc[1]
      .toUpperCase()
      .replace(/\s+/g, '');

    return {
      make: 'Mercedes-Benz',
      model,
      car: `Mercedes-Benz ${model}`
    };
  }

  for (const rawMake of VEHICLE_MAKES) {
    const re = new RegExp(
      `\\b${escapeRe(rawMake)}\\b\\s+([A-Za-z0-9][A-Za-z0-9.\\-]{1,20})`,
      'i'
    );

    const match = source.match(re);

    if (match) {
      const make =
        rawMake === 'VW'
          ? 'Volkswagen'
          : rawMake.replace('Š', 'S');

      return {
        make,
        model: match[1],
        car: `${make} ${match[1]}`
      };
    }
  }

  return {};
}

function extractYear(text = '') {
  const match = String(text).match(
    /\b((?:19|20)\d{2})\b/
  );

  return match ? match[1] : '';
}

function extractEngine(text = '') {
  const source = String(text);

  const size = source.match(
    /\b([0-6][.,][0-9])\s*(?:l(?:itra(?:inen)?)?)?\b/i
  );

  const fuel = source.match(
    /\b(bensa|bensiini|diesel|tdci|tdi|tsi|tfsi|gdi|crdi|dci|hdi|phev|hybrid|hybridi|sähkö|electric)\b/i
  );

  if (size) {
    const engineSize = size[1].replace(',', '.');
    const fuelName = (fuel?.[1] || '').toLowerCase();

    return (
      `${engineSize}${fuelName ? ' ' + fuelName : ''}`
    ).trim();
  }

  return fuel ? fuel[1] : '';
}

function enrichCaseData(
  raw = {},
  history = [],
  userMessage = ''
) {
  const caseData = { ...raw };

  caseData.tools = Array.isArray(raw.tools)
    ? raw.tools
    : [];

  const text = recentUserText(
    history,
    userMessage
  );

  const vehicle = findVehicleFromText(text);

  if (
    !String(caseData.car || '').trim() &&
    vehicle.car
  ) {
    caseData.car = vehicle.car;
  }

  if (!String(caseData.year || '').trim()) {
    caseData.year = extractYear(text);
  }

  if (!String(caseData.engine || '').trim()) {
    caseData.engine = extractEngine(text);
  }

  if (!String(caseData.dtc || '').trim()) {
    caseData.dtc = parseDtcCodes(text).join(', ');
  }

  caseData.make = String(
    caseData.make ||
    vehicle.make ||
    ''
  ).trim();

  caseData.model = String(
    caseData.model ||
    vehicle.model ||
    ''
  ).trim();

  return caseData;
}

// Ulkoisten tietolähteiden yhdistäminen.

async function getTechnicalContext(c, env) {
  const [
    vehicle,
    dtcs,
    obdex
  ] = await Promise.all([
    decodeVin(c.vin, c.year),
    lookupDtcs(c.dtc, env),
    lookupObdex(c.dtc)
  ]);

  const [
    obdb,
    wal33d,
    obdexPids
  ] = await Promise.all([
    lookupObdbSignals(c, vehicle),
    lookupWal33d(c.dtc, env),
    lookupObdexPids(c, obdex)
  ]);

  return {
    vehicle,
    dtcs,
    obdex,
    obdexPids,
    obdb,
    wal33d
  };
}

async function decodeVin(vinRaw, yearRaw) {
  const vin = cleanVin(vinRaw);

  if (vin.length < 11) {
    return null;
  }

  const year = String(yearRaw || '')
    .replace(/[^0-9]/g, '')
    .slice(0, 4);

  const url = new URL(
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}`
  );

  url.searchParams.set('format', 'json');

  if (year) {
    url.searchParams.set('modelyear', year);
  }

  try {
    const response = await fetch(
      url.toString(),
      {
        headers: {
          'User-Agent': 'AutosahkoapuAI/1.0'
        }
      }
    );

    if (!response.ok) {
      return {
        source: 'NHTSA vPIC',
        vin,
        error: 'VIN-palvelu ei vastannut'
      };
    }

    const raw = await response.json();
    const result = raw?.Results?.[0] || {};

    const value = key =>
      String(result[key] || '').trim();

    return {
      source: 'NHTSA vPIC',
      vin,
      make: value('Make'),
      model: value('Model'),
      modelYear: value('ModelYear'),
      trim: value('Trim'),
      bodyClass: value('BodyClass'),
      vehicleType: value('VehicleType'),
      engineCylinders: value('EngineCylinders'),
      displacementL: value('DisplacementL'),
      fuelType: value('FuelTypePrimary'),
      driveType: value('DriveType'),
      plantCountry: value('PlantCountry'),
      errorCode: value('ErrorCode'),
      errorText: value('ErrorText')
    };

  } catch (e) {
    console.error('vPIC', e);

    return {
      source: 'NHTSA vPIC',
      vin,
      error: 'VIN-haku epäonnistui'
    };
  }
}

// Autodiag2 / Cloudflare D1.

async function lookupDtcs(raw, env) {
  const codes = parseDtcCodes(raw);

  if (!codes.length) {
    return [];
  }

  if (!env.AUTODIAG_DB) {
    return codes.map(code => ({
      code,
      source: 'Autodiag2',
      available: false,
      note: 'Autodiag2 D1 -sidonta puuttuu'
    }));
  }

  const output = [];

  for (const code of codes) {
    try {
      const query = `
        SELECT
          d.code,
          d.definition,
          d.description,
          m.name AS manufacturer,
          e.model AS ecu_model
        FROM ad_dtc AS d
        JOIN ad_ecu AS e
          ON e.id = d.ecu_id
        LEFT JOIN ad_manufacturer AS m
          ON m.id = e.manufacturer_id
        WHERE d.code = ?
        ORDER BY
          CASE WHEN m.name IS NULL THEN 1 ELSE 0 END,
          m.name,
          e.model
        LIMIT 8
      `;

      const rows = await env.AUTODIAG_DB
        .prepare(query)
        .bind(code)
        .all();

      if (rows?.results?.length) {
        output.push(
          ...rows.results.map(row => ({
            ...row,
            source: 'Autodiag2',
            available: true
          }))
        );
      } else {
        output.push({
          code,
          source: 'Autodiag2',
          available: false,
          note:
            'Koodille ei löytynyt määritelmää avoimesta tietokannasta'
        });
      }

    } catch (e) {
      console.error('Autodiag2 query', e);

      output.push({
        code,
        source: 'Autodiag2',
        available: false,
        note: 'DTC-tietokantahaku epäonnistui'
      });
    }
  }

  return output;
}

// OBDex: geneeriset vikakoodit.

async function lookupObdex(raw) {
  const codes = parseDtcCodes(raw);

  if (!codes.length) {
    return [];
  }

  try {
    const cache = caches.default;

    const request = new Request(
      'https://foerbsnavi.github.io/obdex/generic.min.json',
      {
        headers: {
          Accept: 'application/json'
        }
      }
    );

    let response = await cache.match(request);

    if (!response) {
      const live = await fetch(request);

      if (!live.ok) {
        throw new Error(
          `OBDex HTTP ${live.status}`
        );
      }

      response = new Response(
        live.body,
        live
      );

      response.headers.set(
        'Cache-Control',
        'public, max-age=86400'
      );

      await cache.put(
        request,
        response.clone()
      );
    }

    const all = await response.json();
    const wanted = new Set(codes);

    return all
      .filter(row =>
        wanted.has(
          String(row.code || '').toUpperCase()
        )
      )
      .slice(0, 12)
      .map(row => ({
        source: 'OBDex',
        code: row.code,
        category: row.category,
        title: row?.title?.en || '',
        description:
          row?.description?.en || '',
        affectedComponents:
          Array.isArray(row.affected_components)
            ? row.affected_components.slice(0, 8)
            : [],
        commonCauses:
          Array.isArray(row.common_causes)
            ? row.common_causes.slice(0, 8)
            : [],
        symptoms:
          Array.isArray(row.symptoms)
            ? row.symptoms.slice(0, 8)
            : [],
        relatedCodes:
          Array.isArray(row.related_codes)
            ? row.related_codes.slice(0, 8)
            : [],
        available: true
      }));

  } catch (e) {
    console.error('OBDex', e);

    return codes.map(code => ({
      source: 'OBDex',
      code,
      available: false,
      note: 'OBDex-haku epäonnistui'
    }));
  }
}

// OBDex: yleiset OBD-mittausparametrit.

async function lookupObdexPids(
  c,
  obdexRows = []
) {
  const rawTerms = [];

  for (const row of obdexRows || []) {
    rawTerms.push(
      row?.title || '',
      row?.description || ''
    );

    for (
      const component of
      row?.affectedComponents || []
    ) {
      rawTerms.push(
        typeof component === 'string'
          ? component
          : JSON.stringify(component)
      );
    }
  }

  rawTerms.push(
    c?.dtc || '',
    c?.car || '',
    c?.engine || ''
  );

  const aliases = {
    maf: [
      'maf',
      'mass air',
      'air flow',
      'ilmamäär'
    ],
    map: [
      'map',
      'manifold',
      'intake pressure'
    ],
    fuel: [
      'fuel',
      'lambda',
      'oxygen',
      'o2',
      'trim',
      'seos',
      'polttoaine'
    ],
    coolant: [
      'coolant',
      'temperature',
      'ect',
      'jäähdytys'
    ],
    throttle: [
      'throttle',
      'tps',
      'kaasuläpp'
    ],
    rpm: [
      'rpm',
      'engine speed',
      'kierros'
    ],
    speed: [
      'vehicle speed',
      'vss',
      'nopeus'
    ],
    voltage: [
      'voltage',
      'battery',
      'control module voltage',
      'jännite'
    ]
  };

  const hay = rawTerms
    .join(' ')
    .toLowerCase();

  const wanted = [];

  for (
    const [key, words] of
    Object.entries(aliases)
  ) {
    if (
      words.some(word => hay.includes(word))
    ) {
      wanted.push(...words, key);
    }
  }

  if (!wanted.length) {
    wanted.push(
      'rpm',
      'engine speed',
      'load',
      'coolant',
      'maf',
      'map',
      'fuel trim',
      'oxygen',
      'voltage'
    );
  }

  try {
    const url =
      'https://foerbsnavi.github.io/obdex/pids/mode01.json';

    const cache = caches.default;

    const request = new Request(
      url,
      {
        headers: {
          Accept: 'application/json'
        }
      }
    );

    let response = await cache.match(request);

    if (!response) {
      const live = await fetch(request);

      if (!live.ok) {
        throw new Error(
          `OBDex PID HTTP ${live.status}`
        );
      }

      response = new Response(
        live.body,
        live
      );

      response.headers.set(
        'Cache-Control',
        'public, max-age=86400'
      );

      await cache.put(
        request,
        response.clone()
      );
    }

    const data = await response.json();

    const list = Array.isArray(data)
      ? data
      : (
        data?.pids ||
        data?.data ||
        []
      );

    const scored = [];

    for (const pid of list) {
      const text = JSON.stringify(
        pid
      ).toLowerCase();

      let score = 0;

      for (const word of wanted) {
        if (
          text.includes(
            String(word).toLowerCase()
          )
        ) {
          score++;
        }
      }

      if (score > 0) {
        scored.push({
          score,
          pid
        });
      }
    }

    scored.sort(
      (a, b) => b.score - a.score
    );

    return scored
      .slice(0, 18)
      .map(item => ({
        source: 'OBDex PID',
        available: true,
        ...item.pid
      }));

  } catch (e) {
    console.error('OBDex PID', e);
    return [];
  }
}

// OBDb: mallikohtaisesti julkaistut signaalit.
//
// Signaalin löytyminen ei yksin vahvista,
// että se soveltuu auton jokaiseen vuosimalliin
// tai moottoriversioon.

function slugPart(value = '') {
  return String(value)
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isHvSignalText(value = '') {
  return /(high[- ]?voltage|\bhv\b|traction|hybrid battery|hvbatt|inverter|contactor|precharge|isolation|service disconnect)/i.test(
    String(value)
  );
}

async function lookupObdbSignals(c, vehicle) {
  const make = slugPart(
    c.make ||
    c.car?.split(/\s+/)?.[0] ||
    vehicle?.make ||
    ''
  );

  let model = slugPart(
    c.model || ''
  );

  const car = String(
    c.car || ''
  ).trim();

  if (!model && car && make) {
    model = slugPart(
      car.replace(
        new RegExp(
          '^' +
          make.replace(/-/g, '[ -]?'),
          'i'
        ),
        ''
      ).trim()
    );
  }

  if (!model) {
    model = slugPart(
      vehicle?.model || ''
    );
  }

  if (!make || !model) {
    return {
      source: 'OBDb',
      available: false,
      note: 'Merkki/malli puuttuu'
    };
  }

  const repo = `${make}-${model}`;

  const urls = [
    `https://raw.githubusercontent.com/OBDb/${encodeURIComponent(repo)}/main/signalsets/v3/default.json`,
    `https://raw.githubusercontent.com/OBDb/${encodeURIComponent(repo)}/master/signalsets/v3/default.json`
  ];

  for (const url of urls) {
    try {
      const response = await fetch(
        url,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent':
              'AutosahkoapuAI/1.0'
          }
        }
      );

      if (!response.ok) {
        continue;
      }

      const data = await response.json();
      const signals = [];

      for (
        const command of data?.commands || []
      ) {
        for (
          const signal of command?.signals || []
        ) {
          const text = [
            signal.id,
            signal.name,
            signal.description,
            signal.path
          ]
            .filter(Boolean)
            .join(' ');

          if (isHvSignalText(text)) {
            continue;
          }

          signals.push({
            id: signal.id || '',
            name: signal.name || '',
            description:
              signal.description || '',
            path: signal.path || '',
            unit: signal?.fmt?.unit || '',
            min: signal?.fmt?.min,
            max: signal?.fmt?.max,
            optimalMin:
              signal?.fmt?.omin,
            optimalMax:
              signal?.fmt?.omax,
            optimalValue:
              signal?.fmt?.oval
          });

          if (signals.length >= 80) {
            break;
          }
        }

        if (signals.length >= 80) {
          break;
        }
      }

      return {
        source: 'OBDb',
        available: true,
        repo,
        license: 'CC-BY-SA-4.0',
        signals
      };

    } catch (e) {
      console.error(
        'OBDb',
        repo,
        e
      );
    }
  }

  return {
    source: 'OBDb',
    available: false,
    repo,
    note:
      'Ajoneuvokohtaista OBDb-signal set -dataa ei löytynyt tällä repo-nimellä'
  };
}

// Valinnainen Wal33D-tietokanta.

async function lookupWal33d(raw, env) {
  const codes = parseDtcCodes(raw);

  if (!codes.length) {
    return [];
  }

  if (!env.OPEN_DTC_DB) {
    return codes.map(code => ({
      source: 'Wal33D',
      code,
      available: false,
      note:
        'Valinnainen OPEN_DTC_DB-sidonta puuttuu'
    }));
  }

  const output = [];

  for (const code of codes) {
    try {
      const rows = await env.OPEN_DTC_DB
        .prepare(`
          SELECT
            code,
            description,
            manufacturer,
            category
          FROM wal33d_dtc
          WHERE code = ?
          LIMIT 12
        `)
        .bind(code)
        .all();

      if (rows?.results?.length) {
        output.push(
          ...rows.results.map(row => ({
            ...row,
            source: 'Wal33D',
            available: true
          }))
        );
      } else {
        output.push({
          source: 'Wal33D',
          code,
          available: false,
          note:
            'Ei osumaa Wal33D-tietokannassa'
        });
      }

    } catch (e) {
      console.error(
        'Wal33D query',
        e
      );

      output.push({
        source: 'Wal33D',
        code,
        available: false,
        note:
          'Wal33D-haku epäonnistui'
      });
    }
  }

  return output;
}

// Asiakkaalle näytettävä lähdeyhteenveto.

function sourceSummary(ctx) {
  const sources = [];

  if (
    ctx?.vehicle?.make ||
    ctx?.vehicle?.model
  ) {
    sources.push({
      name: 'VIN',
      provider: 'NHTSA vPIC',
      ok: true,
      detail: [
        ctx.vehicle.modelYear,
        ctx.vehicle.make,
        ctx.vehicle.model
      ]
        .filter(Boolean)
        .join(' ')
    });
  } else if (ctx?.vehicle) {
    sources.push({
      name: 'VIN',
      provider: 'NHTSA vPIC',
      ok: false,
      detail:
        ctx.vehicle.error ||
        ctx.vehicle.errorText ||
        'Rajallinen tulos'
    });
  }

  const found = (ctx?.dtcs || [])
    .filter(item => item.available);

  const missing = (ctx?.dtcs || [])
    .filter(item => !item.available);

  if (found.length) {
    sources.push({
      name: 'DTC',
      provider: 'Autodiag2',
      ok: true,
      detail: [
        ...new Set(
          found.map(item => item.code)
        )
      ].join(', ')
    });
  }

  if (missing.length) {
    sources.push({
      name: 'DTC',
      provider: 'Autodiag2',
      ok: false,
      detail: [
        ...new Set(
          missing.map(item => item.code)
        )
      ].join(', ') + ' ei löytynyt'
    });
  }

  const obdexFound = (ctx?.obdex || [])
    .filter(item => item.available);

  if (obdexFound.length) {
    sources.push({
      name: 'DTC+',
      provider: 'OBDex',
      ok: true,
      detail: [
        ...new Set(
          obdexFound.map(item => item.code)
        )
      ].join(', ') + ' · syyt/oireet'
    });
  }

  if (ctx?.obdexPids?.length) {
    sources.push({
      name: 'OBD-live data',
      provider: 'OBDex',
      ok: true,
      detail:
        `${ctx.obdexPids.length} relevanttia geneeristä PID-parametria`
    });
  }

  const signalCount =
    Array.isArray(ctx?.obdb?.signals)
      ? ctx.obdb.signals.length
      : 0;

  if (
    ctx?.obdb?.available === true &&
    signalCount > 0
  ) {
    sources.push({
      name: 'Ajoneuvodata',
      provider: 'OBDb',
      ok: true,
      detail:
        `${ctx.obdb.repo} · ${signalCount} signaalia`
    });
  }

  const wal33dFound = (ctx?.wal33d || [])
    .filter(item => item.available);

  if (wal33dFound.length) {
    sources.push({
      name: 'Valmistajakohtainen DTC',
      provider: 'Wal33D',
      ok: true,
      detail: [
        ...new Set(
          wal33dFound.map(item => item.code)
        )
      ].join(', ')
    });
  }

  return sources;
}

// OpenAI-vastauksen käsittely.

function extractText(raw) {
  if (raw.output_text) {
    return raw.output_text;
  }

  for (const item of raw.output || []) {
    for (const content of item.content || []) {
      if (
        content.type === 'output_text' &&
        content.text
      ) {
        return content.text;
      }
    }
  }

  return '';
}

function parseReply(text) {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');

    const object = JSON.parse(
      text.slice(start, end + 1)
    );

    return {
      blocked: object.blocked === true,
      test:
        object.test || 'Vastaus',
      tool:
        object.tool || '',
      how:
        object.how || '',
      expected:
        object.expected || '',
      ifNormal:
        object.ifNormal || '',
      ifAbnormal:
        object.ifAbnormal || '',
      reason:
        String(object.reason || '').trim(),
      caution:
        object.caution || ''
    };

  } catch {
    return {
      blocked: false,
      test: 'AI-vastaus',
      tool: '',
      how:
        text ||
        'Vastausta ei saatu jäsennettyä.',
      expected: '',
      ifNormal: '',
      ifAbnormal: '',
      reason: '',
      caution:
        'Jos vastaus jäi kesken, pyydä tarkennusta ennen mittaamista.'
    };
  }
}

// Varsinainen keskustelu- ja diagnostiikkaohjeistus.

const SYSTEM_PROMPT = `
Olet Autosähköapu AI, mittausohjattu autodiagnostiikan
keskusteluavustaja.

TAVOITE

Auta käyttäjää selvittämään auton vikaa keskustellen,
mittaustuloksia hyödyntäen ja järjestelmällisesti.

Vastaa aina ensin käyttäjän uusimpaan kysymykseen tai
havaintoon.

Älä arvaa vaihdettavaa osaa.
Älä esitä vikahypoteesia varmana diagnoosina.
Älä esitä samaa mittausta pakollisena seuraavana vaiheena
vain siksi, että pyysit sitä aiemmin.

PALAUTUSMUOTO

Palauta AINA vain yksi JSON-objekti.

Älä kirjoita markdownia tai muuta tekstiä JSON-objektin
ulkopuolelle.

Käytä aina seuraavia kenttiä:

blocked
test
tool
how
expected
ifNormal
ifAbnormal
reason
caution

Normaalisti blocked=false.

KENTTIEN MERKITYS

test:
- Mittausvastauksessa mittauksen lyhyt otsikko.
- Tavallisessa keskusteluvastauksessa
  "Vastaus kysymykseen".
- Jos arvioit mittaustulosta ilman uutta mittausta,
  "Mittaustuloksen arviointi".

tool:
- Käytettävä mittalaite, jos annat mittausohjeen.
- Muussa keskusteluvastauksessa tyhjä merkkijono.

how:
- Vastaa ensin käyttäjän uusimpaan viestiin.
- Jos käyttäjä kysyy taustatietoa, vastaa kysymykseen.
- Jos käyttäjä ilmoittaa uuden oireen, käsittele sen
  vaikutus diagnoosin suuntaan.
- Jos käyttäjä ilmoittaa mittaustuloksen, arvioi ensin
  mittaustulos.
- Jos annat mittauksen, kerro miten se tehdään.

expected:
- Mittauksen odotettu tulos vain, jos annat
  uuden mittausohjeen.
- Muussa vastauksessa tyhjä merkkijono.

ifNormal:
- Mitä uuden mittauksen normaalista tuloksesta
  voidaan päätellä.
- Muussa vastauksessa tyhjä merkkijono.

ifAbnormal:
- Mitä uuden mittauksen poikkeavasta tuloksesta
  voidaan päätellä.
- Muussa vastauksessa tyhjä merkkijono.

reason:
- Mittausvastauksessa 1–3 lausetta mittauksen
  diagnostisesta tarkoituksesta.
- Keskusteluvastauksessa lyhyt perustelu tai
  selitys, jos se auttaa käyttäjää.
- Älä toista how-kentän sisältöä sanasta sanaan.

caution:
- Tilanteeseen liittyvä olennainen turvallisuus-
  tai tulkintahuomautus.
- Muussa tapauksessa tyhjä merkkijono.

KESKUSTELUN OHJAUS

Luokittele käyttäjän uusin viesti asiayhteyden perusteella
ennen vastauksen muodostamista.

Mahdollisia viestejä ovat:

- uusi vikatapaus
- aiemmin pyydetty mittaustulos
- tarkentava kysymys
- uusi oire tai uusi käyttötilanne
- aiemman oireen korjaus
- käytettävissä olevan mittalaitteen ilmoittaminen
- ilmoitus siitä, ettei mittausta voitu tehdä
- uusi auto tai selvästi uusi vikatapaus

Yksi viesti voi kuulua useaan ryhmään.

Vastaa koko viestiin, älä pelkästään viimeiseen
tunnistamaasi mittausarvoon tai vikakoodiin.

1. UUSI VIKATAPAUS

Jos käyttäjä ilmoittaa uuden vian eikä aiempaa
mittauspolkua ole:

- Käytä käyttäjän jo antamia ajoneuvotietoja.
- Selvitä oireiden esiintymisolosuhteet.
- Huomioi ilmoitetut vikakoodit ja tehdyt mittaukset.
- Aloita yhdellä perustellulla mittauksella tai
  yhdellä olennaisella tarkentavalla kysymyksellä.

Älä kysy jo ilmoitettuja tietoja uudestaan ilman syytä.

2. TARKENTAVA KYSYMYS

Jos käyttäjä kysyy esimerkiksi:

"Onko tässä mallissa kaasuläppäongelmia?"
"Miksi tämä mitataan?"
"Mistä löydän tämän arvon?"
"Voiko vika olla johtosarjassa?"
"Voinko käyttää yleismittaria?"
"Mitä STFT tarkoittaa?"

vastaa ensin juuri siihen kysymykseen.

Älä anna automaattisesti uutta mittausta.

Jos aiemmin pyydetty mittaus on vielä kesken,
säilytä tieto siitä keskustelussa.

Muistuta mittauksesta vain, jos se on edelleen
tarkoituksenmukainen ja muistutus auttaa
vianetsintää etenemään.

Älä toista samaa mittauspyyntöä jokaisen
välikysymyksen lopussa.

Pelkässä keskusteluvastauksessa käytä:

test="Vastaus kysymykseen"
tool=""
expected=""
ifNormal=""
ifAbnormal=""

3. MITTAUSTULOKSEN ILMOITTAMINEN

Kun käyttäjä ilmoittaa mittaustuloksen:

- Tunnista, mihin mittaukseen tulos liittyy.
- Arvioi tulos sen oikeassa käyttötilanteessa.
- Vertaa sitä aiempiin havaintoihin.
- Kerro, mitä mittaustulos tukee.
- Kerro tarvittaessa, mitä se ei vielä todista.
- Päivitä vikahypoteeseja tuloksen perusteella.

Valitse sen jälkeen seuraava tutkimusvaihe uudelleen.

Älä jatka automaattisesti alkuperäistä
mittausjärjestystä, jos saatu tulos antaa syyn
muuttaa suunnitelmaa.

Jos mittaustuloksesta puuttuu olennainen tieto,
pyydä täydennystä ennen uutta mittausta.

Älä tulkitse puuttuvaa tulosta normaaliksi
tai poikkeavaksi.

4. UUDEN TIEDON VAIKUTUS DIAGNOOSISUUNNITELMAAN

TÄMÄ ON ERITYISEN TÄRKEÄ SÄÄNTÖ.

Arvioi jokaisen uuden käyttäjäviestin jälkeen
uudelleen, mikä on tämänhetkisten tietojen perusteella
tarkoituksenmukaisin seuraava vaihe.

Älä pidä aiemmin pyydettyä mittausta pakollisena
seuraavana vaiheena.

Tarkista:

A) Ilmoittiko käyttäjä uuden oireen, käyttötilanteen,
   mittaustuloksen tai muun olennaisen havainnon?

B) Muuttaako uusi tieto aiempien vikahypoteesien
   merkitystä?

C) Onko aiemmin pyydetty mittaus edelleen
   tarkoituksenmukainen?

D) Onko olemassa toinen mittaus tai tarkentava
   kysymys, joka rajaisi vikaa paremmin?

E) Voivatko useat oireet liittyä samaan vikaan,
   vai pitääkö ne toistaiseksi käsitellä erillisinä?

Jos uusi tieto muuttaa diagnoosin suuntaa olennaisesti:

1. Vastaa ensin käyttäjän kysymykseen.

2. Kerro lyhyesti, mikä uusi havainto muuttaa
   aiempaa diagnoosisuunnitelmaa.

3. Arvioi aiemmin pyydetyn mittauksen
   tarpeellisuus uudelleen.

4. Jos yksi tarkentava kysymys auttaa valitsemaan
   paremman testin, kysy se ennen seuraavaa mittausta.

5. Jos aiempi mittaus ei enää ole paras seuraava
   vaihe, älä vaadi sitä tehtäväksi ensin.

6. Kerro tarvittaessa, että aiempi mittaus
   jää odottamaan tai korvataan toisella testillä.

7. Jos aiempi mittaus on edelleen paras seuraava
   vaihe, sitä saa jatkaa, mutta perustele lyhyesti,
   miksi uusi tieto ei muuta mittauksen valintaa.

ÄLÄ:

- Toista samaa mittauspyyntöä automaattisesti.
- Pidä diagnoosipolkua ennalta määrättyjen
  mittausten jonona.
- Vaadi käyttäjää tekemään vanhaa mittausta,
  jos uusi oire antaa paremman tavan rajata vikaa.
- Oleta, että aiemmin suunniteltu mittaus on tehty.
- Pakota kahta oiretta saman vian seurauksiksi
  ilman niitä yhdistävää näyttöä.
- Unohda käyttäjän uusinta olennaista havaintoa.

ESIMERKKI

Auto käy epätasaisesti kylmänä.
AI pyytää kylmäkäynnin MAF-arvoja.

Käyttäjä kertoo myöhemmin:

"Auto nykii myös lämpimänä vakionopeudensäädin päällä,
mutta ei juuri nyi tasaisella kaasupolkimella.
MAF-arvoa en ole vielä mitannut.
Voivatko nämä oireet liittyä samaan vikaan?"

AI:n pitää vastata, että oireilla voi olla yhteinen
syy, mutta ne voivat myös johtua eri häiriöistä.

Uusi havainto vakionopeudensäätimen aikaisesta
nykimisestä voi muuttaa vianetsinnän suuntaa.

AI ei saa automaattisesti vaatia aiemmin pyydettyä
MAF-mittausta.

Jos oireen luonteen selvittäminen auttaa valitsemaan
seuraavan testin, AI voi kysyä esimerkiksi:

"Kun auto nykii vakionopeudensäätimellä,
vaihteleeko samalla auton nopeus tai
moottorin kierrosluku?"

MAF-mittaus voidaan säilyttää mahdollisena
myöhempänä testinä.

Se ei kuitenkaan ole pakollinen seuraava vaihe
pelkästään sen vuoksi, että sitä pyydettiin aiemmin.

TÄRKEÄÄ:

Tämä esimerkki kuvaa keskustelun toimintatapaa.
Älä sovella Mondeon MAF- tai vakionopeudensäädintestiä
muihin autoihin automaattisesti.

Jokaisen auton mittaussuunnitelman pitää perustua
sen omiin oireisiin ja aiempiin havaintoihin.

5. KESKENERÄINEN MITTAUS

Tarkista aiemmasta keskustelusta:

- Mikä mittaus pyydettiin viimeksi?
- Onko käyttäjä antanut tuloksen?
- Muuttiko myöhemmin ilmoitettu tieto mittauksen
  tarkoituksenmukaisuutta?
- Onko sama mittaus jo tehty toisella tavalla?

Jos mittaustulos puuttuu mutta mittaus on edelleen
hyödyllinen, voit pyytää sitä myöhemmin.

Jos uusi tieto tekee toisesta tutkimussuunnasta
olennaisemman, muuta suunnitelmaa.

Jos käyttäjä ilmoittaa, ettei hän pysty tekemään
mittausta käytettävissä olevilla työkaluilla:

- Älä vaadi mahdotonta mittausta.
- Kerro, mitä työkalua mittaus vaatii.
- Ehdota tarvittaessa turvallista vaihtoehtoa.
- Jos vaihtoehtoa ei ole, sano se.

6. MITTAUSOLOSUHTEET

Erota toisistaan:

- ennen käynnistystä mitatut arvot
- kylmäkäynnistyksen aikaiset arvot
- lämpimän moottorin tyhjäkäyntiarvot
- kuormituksen aikaiset arvot
- ajon aikana esiintyvät oireet
- oireettoman käyttötilanteen arvot

Älä vertaa arvoja ikään kuin ne olisi mitattu
samassa käyttötilanteessa, jos näin ei ole.

Älä pyydä käyttäjää mittaamaan kylmäkäynnistyksen
oiretta lämpimällä moottorilla.

Jos käyttäjä kertoo oireen esiintyvän vain kylmänä,
pyydä juuri siihen tilanteeseen sopivia mittauksia.

Jos toinen oire esiintyy vain ajossa, käsittele
sen mittausolosuhteet erikseen.

Älä pyydä kuljettajaa seuraamaan mittalaitetta
ajon aikana. Käytä tarvittaessa turvallista
lokitallennusta tai matkustajan apua.

7. KÄYTTÄJÄN EHDOTTAMA VIKAKOHDE

Jos käyttäjä kysyy, voisiko jokin komponentti
aiheuttaa oireen:

- Vastaa, onko se teknisesti mahdollinen selitys.
- Erota mahdollinen syy vahvistetusta viasta.
- Älä hyväksy käyttäjän oletusta diagnoosiksi.
- Älä myöskään hylkää sitä ilman perustelua.

Esimerkki:

Kaasuläpän asento voi vaihdella moottorinohjauksen
yrittäessä vakauttaa kierroksia.

Kaasuläpän asennon vaihtelu ei yksin todista
kaasuläpän tai johtosarjan vikaa.

Jos saatavilla on sekä pyydetty että toteutunut
kaasuläpän asento, niiden vertailu voi auttaa,
mutta sekään ei yksin vahvista juurisyytä.

8. TYYPPIVIAT JA MALLIKOHTAINEN TIETO

Jos käyttäjä kysyy tunnetusta viasta,
teknisestä tiedotteesta tai korjaussarjasta:

- Vastaa suoraan käytettävissä olevien
  vahvistettujen tietojen perusteella.
- Älä keksi mallikohtaista tyyppivikaa.
- Älä keksi teknistä tiedotetta, kampanjaa,
  varaosanumeroa tai korjaussarjaa.
- Älä päättele tyyppivikaa pelkän oireen perusteella.
- Älä esitä yleistä autoteknistä tietoa
  valmistajan vahvistamana mallikohtaisena tietona.

Jos vahvistettua mallikohtaista tietoa ei ole,
kerro se suoraan.

Älä väitä, ettei tyyppivikaa ole olemassa
vain siksi, ettei sitä löydy nykyisistä lähteistä.

Älä sovella eri moottoriversion teknistä tiedotetta
käyttäjän autoon.

Esimerkiksi dieselmoottorin tiedotetta ei saa
esittää bensiinimoottoria koskevana.

Myöskään saman mallin eri vuosimallin,
valmistusajankohdan, markkina-alueen tai
VIN-rajauksen tiedotetta ei saa automaattisesti
soveltaa käyttäjän autoon.

Nykyisessä Workerissa ei ole erillistä
teknisten tiedotteiden verkkohakua.

Älä siis väitä tarkistaneesi valmistajan
verkkodokumentteja, jos niitä ei ole annettu
käytettävissä olevaan lähdeaineistoon.

9. KESKUSTELUN JATKUVUUS

Hyödynnä aiempaa keskustelua, auton tietoja,
mittaustuloksia ja käyttäjän havaintoja.

Älä aloita samaa diagnoosipolkua alusta
jokaisessa vastauksessa.

Jos käyttäjä vaihtaa selvästi toiseen autoon,
älä käytä edellisen auton mittaustuloksia
uuden auton diagnoosin perusteena.

Jos käyttäjä ilmoittaa samasta autosta uuden
olennaisen oireen, säilytä aiemmat havainnot,
mutta arvioi niiden merkitys uudelleen.

Älä toista aiempaa mittausta pelkän
keskeneräisen mittauspyynnön vuoksi.

10. TAVALLINEN KESKUSTELU

Kaikki vastaukset eivät tarvitse mittausta.

Jos käyttäjä pyytää selitystä, kysyy yleistä
autoteknistä asiaa tai haluaa keskustella
aiemmasta vastauksesta, vastaa luontevasti.

Älä täytä mittauskenttiä keksityllä sisällöllä.

Jos yksi tarkentava kysymys auttaa vianetsintää
enemmän kuin uusi mittaus, esitä kysymys.

Esitä yleensä vain yksi olennainen
tarkentava kysymys kerrallaan.

DATALÄHDEHIERARKIA

1) Käytä promptissa annettua ulkoista ajoneuvo-
ja DTC-lähdedataa vain siinä laajuudessa,
kuin se todella tukee esitettyä väitettä.

2) NHTSA vPIC voi auttaa VIN-tunnistuksessa,
mutta se ei ole korjaus- tai mittausarvotietokanta.

NHTSA ei välttämättä tunnista eurooppalaista VINiä.
Puutteellinen VIN-tulos ei kumoa käyttäjän
ilmoittamia ajoneuvotietoja.

3) Autodiag2:n DTC-määritelmä auttaa tulkitsemaan
vikakoodia, mutta ei todista juurisyytä.

Se ei automaattisesti sisällä oikeita pinnejä,
johtimien värejä tai mittausarvoja.

4) OBDex voi antaa geneerisiä DTC-kuvauksia,
mahdollisia syitä ja OBD-PID-tietoja.

Käsittele syyt hypoteeseina, älä diagnooseina.

5) OBDb voi sisältää ajoneuvokohtaisia
OBD-signaaleja ja niiden kuvauksia.

OBDb-signaalin löytyminen mallin tietolähteestä
ei yksin vahvista sen soveltuvuutta jokaiseen
vuosimalliin tai moottoriversioon.

OBDb ei ole valmistajan korjausohje.

6) Wal33D voi täydentää valmistajakohtaisia
DTC-määritelmiä, mutta sekään ei todista
juurisyytä.

7) Mallin oma yleinen autotekninen tieto
on vain päättelyn tuki.

Älä esitä muistista tulevaa mallikohtaista
yksityiskohtaa varmennettuna faktana.

8) Jos tarkkaa pinniä, johdinväriä, momenttia,
painetta, vastusarvoa, jännitettä, aaltomuotoa
tai muuta mallikohtaista vertailuarvoa
ei ole lähdedatassa, älä keksi sitä.

Kun mittauksen tulkinta vaatii puuttuvan
mallikohtaisen vertailuarvon, kerro
expected-kentässä, että tarkka OEM-arvo
on varmistettava ajoneuvokohtaisesta
teknisestä lähteestä.

Älä toista OEM-arvon puuttumista jokaisessa
keskusteluvastauksessa, ellei sillä ole
merkitystä juuri kyseisen kysymyksen kannalta.

KÄYTTÄJÄTASOT

Kuluttaja:

- Käytä selkokieltä.
- Avaa lyhenteet ensimmäisellä käyttökerralla.
- Kerro, mistä tarvittava tieto löytyy.
- Vältä ammattijargonia ilman selitystä.
- Salli vain matalan riskin tarkistukset.
- OBD-datan lukeminen on sallittu.
- Silmämääräiset tarkistukset ovat sallittuja.
- Helposti saavutettavat 12 V perusmittaukset
  voidaan sallia asianmukaisin turvallisuusohjein.
- Älä ohjaa airbag- tai SRS-piirien mittauksiin.
- Älä ohjaa polttoainejärjestelmän avaamiseen.
- Älä ohjaa auton alle ilman asianmukaista nostoa.

Harrastaja:

- Voit käyttää yleismittaria ja muita käyttäjän
  ilmoittamia työkaluja.
- Selitä lyhyesti, mitä mitataan ja miksi.
- Huomioi mittauksen riskit.

Mekaanikko:

- Voit käyttää ammattitason teknisiä termejä.
- Ohjaa tehokkaasti diagnoosipolussa.
- Älä silti keksi ajoneuvokohtaisia mittausarvoja.
- Korkeajänniteneuvontaa ei anneta
  tässä verkkopalvelussa.

KORKEAJÄNNITE (HV)

Korkeajännitejärjestelmät on rajattu kokonaan
tämän verkkopalvelun ulkopuolelle
kaikilla käyttäjätasoilla.

Jos käyttäjän viesti, auton tiedot, vikakoodi,
kuva tai muu liite koskee:

- ajoakkua
- HV-akkua
- korkeajännitejärjestelmää
- invertteriä
- HV-kontaktoreita
- esilatausta
- huoltoerotinta
- oransseja HV-kaapeleita
- eristysvikaa
- muuta HV-komponenttia tai HV-työtä

älä anna mittaus-, purku-, korjaus-,
jännitteettömäksi teko- tai testausohjetta.

Palauta:

blocked=true
test="Korkeajännitejärjestelmä"
tool=""
how="Autosähköapu AI ei anna korkeajännitejärjestelmän mittaus-, korjaus- tai purkuohjeita. Ota tässä asiassa suoraan yhteyttä minuun: autosahkoapu@gmail.com"
expected=""
ifNormal=""
ifAbnormal=""
reason="Korkeajännitejärjestelmään liittyvät työt vaativat erillisen turvallisen menettelyn ja asianmukaisen osaamisen."
caution="Korkeajännitejärjestelmiin liittyvät mittaukset ja korjaukset vaativat asianmukaisen koulutuksen ja turvalliset työmenetelmät."

YLEISET DIAGNOOSISÄÄNNÖT

- Käytä vain käyttäjän ilmoittamia työkaluja,
  ellei seuraava testi aidosti vaadi muuta työkalua.

- Jos tarvitaan muu työkalu, kerro siitä
  caution-kentässä.

- Priorisoi mittaukset, jotka rajaavat
  vikamahdollisuuksia tehokkaasti.

- Älä ehdota osien vaihtamista ennen
  riittävää mittausnäyttöä.

- Korkeintaan yksi uusi mittaus yhdessä
  vastauksessa.

- Älä anna uutta mittausta automaattisesti
  jokaiseen käyttäjän viestiin.

- Jos uusi havainto muuttaa diagnoosin suuntaa,
  muuta myös tutkimussuunnitelmaa.

- Jos tarkentava kysymys on mittausta
  hyödyllisempi, kysy ensin.

- Älä vaadi vanhaa mittausta vain siksi,
  että sen tulos on vielä saamatta.
`;

// AI:lle toimitettava tapauskohtainen sisältö.

function buildPrompt(
  c,
  history,
  userMessage,
  context,
  attachments = []
) {
  const past = history
    .map((item, index) => {
      if (item?.role === 'user') {
        return (
          `Käyttäjä: ${String(item.text || '')
            .slice(0, 1800)}`
        );
      }

      if (item?.role === 'assistant') {
        return (
          `AI: ${JSON.stringify(item.reply || {})
            .slice(0, 2500)}`
        );
      }

      return (
        `Vaihe ${index + 1}: ${JSON.stringify(item)
          .slice(0, 2200)}`
      );
    })
    .join('\n');

  const vehicle = context?.vehicle
    ? JSON.stringify(context.vehicle)
    : 'VIN-lähdedataa ei ole.';

  const dtcs = context?.dtcs?.length
    ? JSON.stringify(context.dtcs)
    : 'Autodiag2-lähdedataa ei ole tälle pyynnölle.';

  const obdex = context?.obdex?.length
    ? JSON.stringify(context.obdex)
    : 'OBDex-lähdedataa ei ole tälle pyynnölle.';

  const obdexPids = context?.obdexPids?.length
    ? JSON.stringify(context.obdexPids)
    : 'OBDex PID -dataa ei löytynyt tälle tapaukselle.';

  const obdb =
    context?.obdb?.available &&
    Array.isArray(context?.obdb?.signals) &&
    context.obdb.signals.length > 0
      ? JSON.stringify(context.obdb)
      : 'OBDb-ajoneuvosignaaleja ei löytynyt.';

  const wal33d = context?.wal33d?.length
    ? JSON.stringify(context.wal33d)
    : 'Wal33D-lähdedataa ei ole käytössä.';

  const textFiles = attachments
    .filter(item => item.kind === 'text')
    .map(item =>
      `TIEDOSTO ${item.name}:\n${item.text}`
    )
    .join('\n\n')
    .slice(0, 120000);

  const imageNames = attachments
    .filter(item => item.kind === 'image')
    .map(item => item.name)
    .join(', ');

  return `
KÄYTTÄJÄTASO:

${c.mode || 'consumer'}

AUTO KÄYTTÄJÄN MUKAAN:

${c.car || '-'}

TUNNISTETTU MERKKI:

${c.make || '-'}

TUNNISTETTU MALLI:

${c.model || '-'}

VIN:

${cleanVin(c.vin) || '-'}

VUOSIMALLI:

${c.year || '-'}

MOOTTORI / KÄYTTÖVOIMA:

${c.engine || '-'}

VIKAKOODIT AUTON TIEDOISSA:

${c.dtc || '-'}

KÄYTETTÄVISSÄ OLEVAT TYÖKALUT:

${(c.tools || []).join(', ') || 'ei ilmoitettu'}

ULKOINEN LÄHDEDATA:

VIN / NHTSA vPIC:

${vehicle}

DTC / Autodiag2:

${dtcs}

DTC / OBDex:

${obdex}

GENEERISET OBD-PIDIT / OBDex:

${obdexPids}

AJONEUVOKOHTAISET SIGNAALIT / OBDb:

${obdb}

VALMISTAJAKOHTAISET DTC:T / Wal33D:

${wal33d}

AIEMPI KESKUSTELU:

${past || 'Ei aiempaa keskustelua.'}

KÄYTTÄJÄN UUSIN VIESTI:

${userMessage || '(ei tekstiä, tarkista liitteet)'}

LIITTEET:

Kuvat:
${imageNames || 'ei kuvia'}

${textFiles || 'Ei tekstimuotoista dataa.'}

KUVISTA JA TIEDOSTOISTA:

Jos kuvassa tai datatiedostossa on mittaustulos,
käytä sitä vain siltä osin kuin pystyt lukemaan
sen luotettavasti.

Älä keksi puuttuvia arvoja.

UUSIMMAN VIESTIN KÄSITTELY:

Vastaa ensin käyttäjän uusimpaan viestiin.

Selvitä, antaako viesti uutta tietoa oireista,
käyttötilanteesta, mittaustuloksista tai
käytettävissä olevista työkaluista.

Arvioi jokaisella keskustelukierroksella uudelleen,
mikä on tämänhetkisten tietojen perusteella
tarkoituksenmukaisin seuraava tutkimusvaihe.

ÄLÄ jatka aiemmin suunniteltua mittausjärjestystä
automaattisesti.

Jos käyttäjä ilmoittaa uuden olennaisen oireen,
arvioi muuttaako se aiempaa diagnoosisuunnitelmaa.

Jos aiempi mittaus on edelleen tarkoituksenmukainen,
sitä voi jatkaa.

Jos uusi tieto tekee toisesta tutkimussuunnasta
olennaisemman, muuta suunnitelmaa ja kerro lyhyesti
miksi.

Jos käyttäjän uuden havainnon perusteella
yksi tarkentava kysymys auttaa valitsemaan
paremman mittauksen, kysy se ensin.

Älä muistuta keskeneräisestä mittauksesta
automaattisesti jokaisen vastauksen lopussa.

Jos käyttäjä ilmoittaa, ettei mittausta ole tehty,
älä tulkitse puuttuvaa mittaustulosta
normaaliksi tai poikkeavaksi.

Jos käyttäjä ilmoitti mittaustuloksen,
arvioi se ennen mahdollisen seuraavan
mittauksen ehdottamista.

Älä väitä kahden oireen johtuvan samasta viasta
pelkän samanaikaisen esiintymisen perusteella.

Huomioi aina mittauksen olosuhteet.
Älä käsittele ennen käynnistystä, kylmäkäynnillä
ja lämpimänä ajossa mitattuja arvoja
keskenään samanlaisina mittauksina.

Anna korkeintaan yksi uusi mittaus
yhdessä vastauksessa.

Jos tarkentava kysymys on hyödyllisempi
kuin uusi mittaus, kysy ensin.

Palauta vastaus sovitussa JSON-muodossa.
`;
}

// Aktivointikoodin luominen.
//
// Voimassaoloaika alkaa tässä versiossa
// edelleen koodin luontihetkestä.

async function createCode(request, env, headers) {
  const auth =
    request.headers.get('Authorization') || '';

  if (
    !env.ADMIN_SECRET ||
    auth !== `Bearer ${env.ADMIN_SECRET}`
  ) {
    return json({
      error: 'Ei oikeutta.'
    }, 401, headers);
  }

  const {
    plan = 'single',
    note = ''
  } = await request.json();

  const packageInfo = PLAN[plan];

  if (!packageInfo) {
    return json({
      error: 'Tuntematon paketti.'
    }, 400, headers);
  }

  const code =
    `ASAI-${randomPart()}-${randomPart()}`;

  const now = Date.now();

  const rec = {
    label: packageInfo.label,
    plan,
    credits: packageInfo.credits,
    createdAt: now,
    expiresAt:
      now +
      packageInfo.expiresDays * 86400000,
    note: String(note).slice(0, 200),
    used: 0,
    disabled: false
  };

  await env.ACCESS_CODES.put(
    `code:${code}`,
    JSON.stringify(rec)
  );

  return json({
    code,
    ...rec,
    remainingText: remainingText(rec)
  }, 200, headers);
}

function randomPart() {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let result = '';

  const bytes = crypto.getRandomValues(
    new Uint8Array(4)
  );

  for (const byte of bytes) {
    result += alphabet[
      byte % alphabet.length
    ];
  }

  return result;
}
