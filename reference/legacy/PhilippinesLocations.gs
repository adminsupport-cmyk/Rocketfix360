/** V13 — Philippine locality suggestions. Read-only, device-gated through rfDeviceCall.
 * No customer personal information is transmitted; place name/code only.
 * Source: PSGC public geographic-data API; third-party availability can vary.
 */
function rfPhLocations_(mode, query, code) {
  mode = String(mode || '');
  query = String(query || '').trim().slice(0, 80);
  code = String(code || '').trim();
  if (!['bootstrap', 'barangays', 'barangaySearch', 'barangayResolve'].includes(mode)) throw Error('Unsupported PH lookup.');
  if (['barangays','barangayResolve'].includes(mode) && !/^\d{6,12}$/.test(code)) throw Error('Invalid locality code.');
  if (mode === 'barangaySearch' && (query.length < 3 || !/^[\p{L}\p{N}\s.,\-']+$/u.test(query))) return {records: [], source: 'search', message: 'Enter 3 or more characters.'};
  const fetchList = (url, maxSize) => {
    const r = UrlFetchApp.fetch(url, {muteHttpExceptions: true, followRedirects: true, timeout: 10000});
    if (r.getResponseCode() !== 200) throw Error('PSGC API status ' + r.getResponseCode());
    const body = r.getContentText();
    if (body.length > maxSize) throw Error('PSGC response exceeded safe size.');
    const parsed = JSON.parse(body);
    const array = Array.isArray(parsed) ? parsed : Array.isArray(parsed.data) ? parsed.data : Array.isArray(parsed.results) ? parsed.results : [];
    return array.map(x => ({
      code: String(x.code || x.psgcCode || x.psgc_code || ''),
      name: String(x.name || ''),
      region: String(typeof x.region === 'object' ? (x.region.name || x.region.code || '') : (x.region || x.region_name || '')),
      regionCode: String(x.regionCode || x.region_code || (x.region && typeof x.region === 'object' && x.region.code) || ''),
      province: String(typeof x.province === 'object' ? (x.province.name || '') : (x.province || x.province_name || '')),
      provinceCode: String(x.provinceCode || x.province_code || (x.province && typeof x.province === 'object' && x.province.code) || ''),
      city: String(typeof x.city === 'object' ? (x.city.name || '') : (x.city || x.city_name || x.city_municipality || '')),
      cityCode: String(x.cityCode || x.city_code || x.city_municipality_code || (x.city && typeof x.city === 'object' && x.city.code) || ''),
      municipality: String(typeof x.municipality === 'object' ? (x.municipality.name || '') : (x.municipality || '')),
      zipCode: String(x.zip_code || x.zipCode || '')
    })).filter(x => x.name);
  };
  const read = (primary, fallback, maxSize) => {
    try { return fetchList(primary, maxSize); }
    catch (e) { if (!fallback) throw e; return fetchList(fallback, maxSize); }
  };
  if (mode === 'barangayResolve') {
    const base = 'https://psgc.cloud/api/v1/barangays/' + encodeURIComponent(code);
    const readOne = suffix => {
      try {
        const r = UrlFetchApp.fetch(base + suffix, {muteHttpExceptions:true, followRedirects:true});
        if (r.getResponseCode() !== 200 || r.getContentText().length > 25000) return {};
        const v = JSON.parse(r.getContentText()); return v.data || v;
      } catch(e) { return {}; }
    };
    const n = x => String(x && x.name || '');
    const brgy = readOne(''), city = readOne('/city'), municipality = readOne('/municipality'), province = readOne('/province'), region = readOne('/region');
    return {name:n(brgy), city:n(city)||n(municipality), cityCode:String(city.code||municipality.code||''),
      province:n(province), provinceCode:String(province.code||''), region:n(region), regionCode:String(region.code||'')};
  }
  if (mode === 'bootstrap') {
    const provinces = read('https://psgc.gitlab.io/api/provinces/', 'https://psgc.cloud/api/v2/provinces', 450000);
    const localities = read('https://psgc.gitlab.io/api/cities-municipalities/', 'https://psgc.cloud/api/v2/cities-municipalities', 1400000);
    const regions = read('https://psgc.gitlab.io/api/regions/', 'https://psgc.cloud/api/v2/regions', 90000);
    return {provinces, localities, regions, source: 'PSGC'};
  }
  if (mode === 'barangays') {
    const array = read('https://psgc.gitlab.io/api/cities-municipalities/' + encodeURIComponent(code) + '/barangays/',
      'https://psgc.cloud/api/v2/cities-municipalities/' + encodeURIComponent(code) + '/barangays', 700000);
    return {records: array, source: 'PSGC'};
  }
  const q = encodeURIComponent(query);
  const array = read('https://psgc.cloud/api/v1/barangays?q=' + q + '&per_page=25',
    'https://psgc.cloud/api/v1/barangays?q=' + q + '&per_page=15', 180000);
  return {records: array, source: 'PSGC'};
}
