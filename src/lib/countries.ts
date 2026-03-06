export type CountryOption = {
  code: string; // ISO 3166-1 alpha-2 (e.g. "ES")
  name: string; // localized display name (e.g. "Spain")
  flag: string; // emoji flag (e.g. "🇪🇸")
};

export function countryCodeToFlagEmoji(code: string): string {
  const cc = (code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '🏳️';
  const A = 0x1f1e6; // Regional Indicator Symbol Letter A
  const base = 'A'.charCodeAt(0);
  const first = A + (cc.charCodeAt(0) - base);
  const second = A + (cc.charCodeAt(1) - base);
  return String.fromCodePoint(first, second);
}

// Fallback list to guarantee "all countries" availability even when
// Intl.supportedValuesOf('region') is not supported.
// Includes widely used pseudo-code "XK" (Kosovo).
const FALLBACK_ISO2_CODES: string[] = [
  "AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ",
  "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS","BT","BV","BW","BY","BZ",
  "CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN","CO","CR","CU","CV","CW","CX","CY","CZ",
  "DE","DJ","DK","DM","DO","DZ",
  "EC","EE","EG","EH","ER","ES","ET",
  "FI","FJ","FK","FM","FO","FR",
  "GA","GB","GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY",
  "HK","HM","HN","HR","HT","HU",
  "ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT",
  "JE","JM","JO","JP",
  "KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ",
  "LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY",
  "MA","MC","MD","ME","MF","MG","MH","MK","ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ",
  "NA","NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ",
  "OM",
  "PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT","PW","PY",
  "QA",
  "RE","RO","RS","RU","RW",
  "SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS","ST","SV","SX","SY","SZ",
  "TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ",
  "UA","UG","UM","US","UY","UZ",
  "VA","VC","VE","VG","VI","VN","VU",
  "WF","WS",
  "YE","YT",
  "ZA","ZM","ZW",
  "XK"
];

export function getAllCountries(locale?: string): CountryOption[] {
  const lang = locale || (typeof navigator !== 'undefined' ? navigator.language : 'en');
  const displayNames = new Intl.DisplayNames([lang], { type: 'region' });

  let codes: string[] = [];
  try {
    // Not supported in all browsers, hence fallback.
    const supportedValuesOf = (Intl as any).supportedValuesOf as undefined | ((key: string) => string[]);
    const maybe = supportedValuesOf?.('region') ?? [];
    if (Array.isArray(maybe)) codes = maybe;
  } catch {
    // ignore
  }

  if (!codes.length) codes = FALLBACK_ISO2_CODES;

  const options = codes
    .map((code) => (code || '').toUpperCase())
    .filter((code) => /^[A-Z]{2}$/.test(code))
    .map((code) => ({
      code,
      name: displayNames.of(code) ?? code,
      flag: countryCodeToFlagEmoji(code),
    }))
    // Some environments may include duplicates; de-dupe by code.
    .reduce<CountryOption[]>((acc, cur) => {
      if (!acc.some((a) => a.code === cur.code)) acc.push(cur);
      return acc;
    }, [])
    .sort((a, b) => a.name.localeCompare(b.name));

  return options;
}


