const CODES = "AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI KH CM CA CV CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW".split(" ");
const dn = new Intl.DisplayNames(["en"], { type: "region" });

/** All countries by English name, sorted. Customers store the name as text. */
export const COUNTRY_NAMES: string[] = CODES.map((c) => dn.of(c) ?? c).sort((a, b) => a.localeCompare(b));
export const DEFAULT_COUNTRY = "Singapore";

/** Select data; keeps an existing free-text value that isn't in the list so it isn't lost. */
export function countryOptions(current?: string) {
  return current && !COUNTRY_NAMES.includes(current) ? [current, ...COUNTRY_NAMES] : COUNTRY_NAMES;
}
