import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  APIProvider,
  InfoWindow,
  Map,
  Marker,
  useMapsLibrary,
  type MapMouseEvent,
} from "@vis.gl/react-google-maps";
import { Check, LocateFixed, MapPin, Search, Trash2 } from "lucide-react";
import { currency, isoToday } from "../lib/calculations";
import type { Customer, Job, Solicitation, SolicitationOutcome } from "../types/business";

type Coordinates = { latitude: number; longitude: number };

type JobLocation = {
  key: string;
  address: string;
  latitude: number;
  longitude: number;
  jobs: Job[];
  approximate?: boolean;
};

type SelectedLocation =
  | { kind: "job"; location: JobLocation }
  | { kind: "solicitation"; location: Solicitation };

type Props = {
  customers: Customer[];
  jobs: Job[];
  solicitations: Solicitation[];
  onSaveJobCoordinates: (jobIds: string[], coordinates: Coordinates) => Promise<void>;
  onCreateSolicitation: (solicitation: Omit<Solicitation, "id">) => Promise<void>;
  onUpdateSolicitation: (id: string, patch: Partial<Solicitation>) => Promise<void>;
  onDeleteSolicitation: (id: string) => Promise<void>;
};

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? "";
const defaultCenter = { lat: 29.7174, lng: -95.4307 };
const jobCoordinateCacheKey = "powerwashing-pros-job-coordinate-cache-v1";
const outcomes: SolicitationOutcome[] = ["visited", "no answer", "interested", "follow up", "not interested"];
const outcomeColors: Record<SolicitationOutcome, string> = {
  visited: "#64748b",
  "no answer": "#f59e0b",
  interested: "#2563eb",
  "follow up": "#8b5cf6",
  "not interested": "#ef4444",
};

function normalizedAddress(address: string) {
  return address.toLowerCase().replace(/\bstreet\b/g, "st").replace(/\bavenue\b/g, "ave").replace(/[^a-z0-9]/g, "");
}

function blueBonnetStreetNumber(address: string) {
  return address.trim().match(/^(\d{3,5})\s+blue\s*bonnet(?:\s+(?:blvd|boulevard))?$/i)?.[1] ?? null;
}

const bellaireStreetNames = new Set([
  "beech", "braeburn", "huisache", "oleander", "orleander", "palmetto", "pamela", "pamellia",
  "park", "pine", "spruce", "valerie", "vernon", "vernons", "vernone", "verone", "willow",
]);

function parsedStreetAddress(address: string) {
  const match = address.trim().match(/^(\d{2,6})\s+(.+?)\s*$/);
  if (!match) return null;
  const number = match[1];
  const street = match[2]
    .replace(/[)'’]/g, "")
    .replace(/\b(?:street|st|drive|dr|court|ct|boulevard|blvd)\.?$/i, "")
    .trim()
    .toLowerCase();
  return { number, street };
}

function bellaireAddress(address: string) {
  const parsed = parsedStreetAddress(address);
  if (!parsed || !bellaireStreetNames.has(parsed.street)) return null;
  const correctedStreet = parsed.street === "orleander"
    ? "Oleander St"
    : parsed.street === "vernone" || parsed.street === "vernon" || parsed.street === "vernons"
      ? "Verone St"
      : parsed.street === "pamela" || parsed.street === "pamellia"
        ? "Pamellia Dr"
        : parsed.street === "braeburn"
          ? "Braeburn Dr"
          : parsed.street === "park"
            ? (/\b(?:court|ct)\b/i.test(address) ? "Park Ct" : "Park St")
            : `${parsed.street.replace(/^./, (letter) => letter.toUpperCase())} St`;
  return `${parsed.number} ${correctedStreet}, Bellaire, TX 77401`;
}

function isUsableJobAddress(address: string) {
  const value = address.trim().toLowerCase();
  return Boolean(value) && value !== "unknown" && value !== "n/a" && value !== "not listed";
}

function geocodingQuery(address: string) {
  const blueBonnetNumber = blueBonnetStreetNumber(address);
  if (blueBonnetNumber) return `${blueBonnetNumber} Blue Bonnet Blvd, Houston, TX 77025`;
  const localBellaireAddress = bellaireAddress(address);
  if (localBellaireAddress) return localBellaireAddress;
  if (/^3818\s+rice\b/i.test(address)) return "3818 Rice Blvd, Houston, TX 77005";
  if (/^4103\s+university\b/i.test(address)) return "4103 University Blvd, Houston, TX 77005";
  if (/\b(?:tx|texas|houston)\b/i.test(address)) return address;
  const reversedStreetNumber = address.trim().match(/^([^\d]+?)\s+(\d{2,6})$/);
  const normalized = reversedStreetNumber ? `${reversedStreetNumber[2]} ${reversedStreetNumber[1].trim()}` : address;
  return `${normalized}, Houston, TX`;
}

function coordinatesMatchAddress(address: string, latitude: number, longitude: number) {
  const parsed = parsedStreetAddress(address);
  if (parsed && ["vernon", "vernons", "vernone"].includes(parsed.street)) {
    return latitude >= 29.68 && latitude <= 29.73 && longitude >= -95.465 && longitude <= -95.43;
  }
  if (bellaireAddress(address)) {
    return latitude >= 29.68 && latitude <= 29.73 && longitude >= -95.47 && longitude <= -95.43;
  }
  if (/^(?:3818\s+rice|4103\s+university)\b/i.test(address)) {
    return latitude >= 29.70 && latitude <= 29.73 && longitude >= -95.46 && longitude <= -95.425;
  }
  if (blueBonnetStreetNumber(address)) {
    return latitude >= 29.68 && latitude <= 29.73 && longitude >= -95.47 && longitude <= -95.41;
  }
  return true;
}

function needsGeocoding(job: Job) {
  if (job.latitude == null || job.longitude == null) return true;
  return !coordinatesMatchAddress(job.address, job.latitude, job.longitude);
}

function customerName(customers: Customer[], customerId: string) {
  return customers.find((customer) => customer.id === customerId)?.name ?? "Customer";
}

function readJobCoordinateCache(): Record<string, Coordinates> {
  try {
    const saved = globalThis.localStorage?.getItem(jobCoordinateCacheKey);
    return saved ? JSON.parse(saved) as Record<string, Coordinates> : {};
  } catch {
    return {};
  }
}

function writeJobCoordinateCache(cache: Record<string, Coordinates>) {
  try {
    globalThis.localStorage?.setItem(jobCoordinateCacheKey, JSON.stringify(cache));
  } catch {
    // The map still works when storage is disabled; only cross-session caching is lost.
  }
}

function markerIcon(color: string, scale = 7): google.maps.Symbol {
  return {
    // SymbolPath.CIRCLE is 0; using the value avoids a race before the Maps global loads.
    path: 0 as google.maps.SymbolPath,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeOpacity: 1,
    strokeWeight: 2,
    scale,
  };
}

function JobMarkers({
  locations,
  onSelect,
}: {
  locations: JobLocation[];
  onSelect: (location: JobLocation) => void;
}) {
  function handleClick(event: google.maps.MapMouseEvent, location: JobLocation) {
    event.stop();
    onSelect(location);
  }

  return locations.map((location) => (
    <Marker
      key={location.key}
      position={{ lat: location.latitude, lng: location.longitude }}
      icon={markerIcon(
        location.approximate
          ? "#64748b"
          : location.jobs.every((job) => job.status === "completed") ? "#059669" : "#2563eb",
        6,
      )}
      title={location.approximate ? `${location.jobs[0].date} job; address unavailable` : `${location.jobs[0].date} job at ${location.address}`}
      onClick={(event) => handleClick(event, location)}
    />
  ));
}

function GoogleBusinessMap({
  customers,
  jobs,
  solicitations,
  onSaveJobCoordinates,
  onCreateSolicitation,
  onUpdateSolicitation,
  onDeleteSolicitation,
}: Props) {
  const geocoding = useMapsLibrary("geocoding");
  const geocoder = useMemo(() => geocoding ? new geocoding.Geocoder() : null, [geocoding]);
  const [showJobs, setShowJobs] = useState(true);
  const [showSolicitations, setShowSolicitations] = useState(true);
  const [outcomeFilter, setOutcomeFilter] = useState<"all" | SolicitationOutcome>("all");
  const [selected, setSelected] = useState<SelectedLocation | null>(null);
  const [address, setAddress] = useState("");
  const [solicitedDate, setSolicitedDate] = useState(isoToday());
  const [outcome, setOutcome] = useState<SolicitationOutcome>("visited");
  const [notes, setNotes] = useState("");
  const [draftCoordinates, setDraftCoordinates] = useState<Coordinates | null>(null);
  const [locatedAddress, setLocatedAddress] = useState("");
  const [formStatus, setFormStatus] = useState("Click a property on the map or search an address.");
  const [saving, setSaving] = useState(false);
  const [geocodingProgress, setGeocodingProgress] = useState("");
  const [jobCoordinateCache, setJobCoordinateCache] = useState(readJobCoordinateCache);
  const failedJobAddresses = useRef(new Set<string>());
  const geocodingJobAddresses = useRef(new Set<string>());

  const jobsWithAddresses = useMemo(() => jobs.filter((job) => isUsableJobAddress(job.address)), [jobs]);
  const jobsWithoutAddresses = useMemo(() => jobs.filter((job) => !isUsableJobAddress(job.address)), [jobs]);
  const jobsMissingAddresses = jobs.length - jobsWithAddresses.length;
  const locatedJobs = useMemo(() => jobsWithAddresses.map((job) => {
    if (job.latitude != null && job.longitude != null) return job;
    const cached = jobCoordinateCache[normalizedAddress(job.address)];
    return cached ? { ...job, ...cached } : job;
  }), [jobsWithAddresses, jobCoordinateCache]);
  const missingGroups = useMemo(() => {
    const groups = new globalThis.Map<string, Job[]>();
    locatedJobs.filter(needsGeocoding).forEach((job) => {
      const key = normalizedAddress(job.address);
      groups.set(key, [...(groups.get(key) ?? []), job]);
    });
    return [...groups.entries()].map(([key, groupedJobs]) => ({ key, jobs: groupedJobs, address: groupedJobs[0].address }));
  }, [locatedJobs]);

  useEffect(() => {
    if (!geocoder || missingGroups.length === 0) {
      if (missingGroups.length === 0) setGeocodingProgress("");
      return;
    }
    let canceled = false;
    const activeGeocoder = geocoder;

    async function geocodeJobs() {
      const pending = missingGroups.filter((group) =>
        !failedJobAddresses.current.has(group.key) && !geocodingJobAddresses.current.has(group.key));
      for (let index = 0; index < pending.length; index += 1) {
        if (canceled) return;
        const group = pending[index];
        geocodingJobAddresses.current.add(group.key);
        setGeocodingProgress(`Locating jobs ${index + 1} of ${pending.length}`);
        try {
          const response = await activeGeocoder.geocode({ address: geocodingQuery(group.address), region: "US" });
          const location = response.results[0]?.geometry.location;
          if (!location) throw new Error("No matching property found");
          const coordinates = {
            latitude: location.lat(),
            longitude: location.lng(),
          };
          if (!coordinatesMatchAddress(group.address, coordinates.latitude, coordinates.longitude)) {
            throw new Error("Address result was outside the expected service area");
          }
          setJobCoordinateCache((current) => {
            const next = { ...current, [group.key]: coordinates };
            writeJobCoordinateCache(next);
            return next;
          });
          void onSaveJobCoordinates(group.jobs.map((job) => job.id), coordinates).catch(() => {
            // Browser caching prevents repeat lookups if the database is temporarily unavailable.
          });
        } catch {
          failedJobAddresses.current.add(group.key);
        } finally {
          geocodingJobAddresses.current.delete(group.key);
        }
      }
      if (!canceled) setGeocodingProgress("");
    }

    void geocodeJobs();
    return () => { canceled = true; };
  }, [geocoder, missingGroups, onSaveJobCoordinates]);

  const jobLocations = useMemo(() => {
    const groups = new globalThis.Map<string, Job[]>();
    locatedJobs.forEach((job) => {
      if (job.latitude == null || job.longitude == null) return;
      const key = normalizedAddress(job.address);
      groups.set(key, [...(groups.get(key) ?? []), job]);
    });

    const exactLocations = [...groups.values()].flatMap((jobsAtAddress) => jobsAtAddress.map((job, index) => {
      const angle = (2 * Math.PI * index) / jobsAtAddress.length;
      const offset = jobsAtAddress.length > 1 ? 0.00009 : 0;
      return {
        key: job.id,
        address: job.address,
        latitude: job.latitude! + Math.sin(angle) * offset,
        longitude: job.longitude! + Math.cos(angle) * offset,
        jobs: [job],
      };
    }));

    const unavailableLocations = jobsWithoutAddresses.map((job, index) => {
      const ring = 1 + Math.floor(index / 8);
      const angle = (2 * Math.PI * (index % 8)) / 8;
      return {
        key: job.id,
        address: "Location unavailable",
        latitude: defaultCenter.lat + Math.sin(angle) * ring * 0.0012,
        longitude: defaultCenter.lng + Math.cos(angle) * ring * 0.0012,
        jobs: [job],
        approximate: true,
      };
    });

    return [...exactLocations, ...unavailableLocations];
  }, [jobsWithoutAddresses, locatedJobs]);

  const mappedJobCount = jobLocations.length;
  const uniqueLocationCount = useMemo(
    () => new Set(jobLocations.map((location) => normalizedAddress(location.address))).size,
    [jobLocations],
  );
  const locatingJobCount = jobsWithAddresses.length - (mappedJobCount - jobsMissingAddresses);

  const visibleSolicitations = useMemo(
    () => solicitations.filter((item) => outcomeFilter === "all" || item.outcome === outcomeFilter),
    [outcomeFilter, solicitations],
  );

  const reverseGeocode = useCallback(async (position: google.maps.LatLngLiteral) => {
    setDraftCoordinates({ latitude: position.lat, longitude: position.lng });
    setSelected(null);
    setFormStatus("Looking up this property...");
    if (!geocoder) return;
    try {
      const response = await geocoder.geocode({ location: position });
      const formattedAddress = response.results[0]?.formatted_address ?? `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`;
      setAddress(formattedAddress);
      setLocatedAddress(formattedAddress);
      setFormStatus("Property selected. Choose the result and save it.");
    } catch {
      const coordinates = `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`;
      setAddress(coordinates);
      setLocatedAddress(coordinates);
      setFormStatus("Pin selected. Add any identifying address details before saving.");
    }
  }, [geocoder]);

  function handleMapClick(event: MapMouseEvent) {
    if (event.detail.latLng) void reverseGeocode(event.detail.latLng);
  }

  async function locateTypedAddress() {
    if (!geocoder || !address.trim()) return null;
    setFormStatus("Finding that address...");
    const response = await geocoder.geocode({ address: geocodingQuery(address.trim()), region: "US" });
    const result = response.results[0];
    if (!result) throw new Error("Address not found");
    const coordinates = { latitude: result.geometry.location.lat(), longitude: result.geometry.location.lng() };
    setAddress(result.formatted_address);
    setLocatedAddress(result.formatted_address);
    setDraftCoordinates(coordinates);
    setFormStatus("Address located. Choose the result and save it.");
    return { coordinates, formattedAddress: result.formatted_address };
  }

  async function submitSolicitation(event: React.FormEvent) {
    event.preventDefault();
    if (!address.trim()) {
      setFormStatus("Enter an address or click a property on the map.");
      return;
    }
    setSaving(true);
    try {
      let coordinates = draftCoordinates;
      let savedAddress = address.trim();
      if (!coordinates || locatedAddress !== address) {
        const located = await locateTypedAddress();
        if (!located) return;
        coordinates = located.coordinates;
        savedAddress = located.formattedAddress;
      }
      await onCreateSolicitation({
        address: savedAddress,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        solicitedDate,
        outcome,
        notes: notes.trim(),
      });
      setAddress("");
      setNotes("");
      setDraftCoordinates(null);
      setLocatedAddress("");
      setOutcome("visited");
      setFormStatus("Solicitation saved to the map.");
    } catch (error) {
      setFormStatus(error instanceof Error ? error.message : "Unable to save this location.");
    } finally {
      setSaving(false);
    }
  }

  const selectedPosition = selected?.kind === "job"
    ? { lat: selected.location.latitude, lng: selected.location.longitude }
    : selected?.kind === "solicitation"
      ? { lat: selected.location.latitude, lng: selected.location.longitude }
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-lagoon dark:text-cyan-300">Field coverage</p>
          <h2 className="text-xl font-bold text-ink dark:text-white">Jobs and canvassing map</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Click a property to record a door you solicited.</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Every job has its own marker. Zoom in to separate nearby properties.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="inline-flex items-center gap-2 font-medium text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={showJobs} onChange={(event) => setShowJobs(event.target.checked)} className="h-4 w-4 accent-emerald-600" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> All jobs
          </label>
          <label className="inline-flex items-center gap-2 font-medium text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={showSolicitations} onChange={(event) => setShowSolicitations(event.target.checked)} className="h-4 w-4 accent-amber-500" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Solicited
          </label>
        </div>
      </div>

      <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative h-[58vh] min-h-[480px] overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900 xl:h-[calc(100vh-245px)] xl:max-h-[760px]">
          <Map
            defaultCenter={defaultCenter}
            defaultZoom={10}
            gestureHandling="greedy"
            mapTypeControl={false}
            streetViewControl={false}
            clickableIcons={false}
            fullscreenControl
            reuseMaps
            onClick={handleMapClick}
          >
            {showJobs && <JobMarkers locations={jobLocations} onSelect={(location) => setSelected({ kind: "job", location })} />}
            {showSolicitations && visibleSolicitations.map((location) => (
              <Marker
                key={location.id}
                position={{ lat: location.latitude, lng: location.longitude }}
                icon={markerIcon(outcomeColors[location.outcome])}
                title={`${location.outcome} at ${location.address}`}
                onClick={(event) => { event.stop(); setSelected({ kind: "solicitation", location }); }}
              />
            ))}
            {draftCoordinates && (
              <Marker
                position={{ lat: draftCoordinates.latitude, lng: draftCoordinates.longitude }}
                icon={markerIcon("#0f172a", 8)}
                title="New solicitation"
              />
            )}
            {selected && selectedPosition && (
              <InfoWindow position={selectedPosition} onCloseClick={() => setSelected(null)}>
                <div className="max-w-[260px] text-sm text-slate-700">
                  <p className="font-semibold text-slate-950">{selected.location.address}</p>
                  {selected.kind === "job" ? (
                    <div className="mt-2 space-y-1">
                      {selected.location.approximate && <p className="text-xs font-semibold text-amber-700">This spreadsheet row has no usable address. This marker is only a placeholder.</p>}
                      <p>{selected.location.jobs.length} job{selected.location.jobs.length === 1 ? "" : "s"} at this property</p>
                      {selected.location.jobs.map((job) => (
                        <p key={job.id} className="text-xs text-slate-600">{job.date}: {customerName(customers, job.customerId)} · {currency.format(job.price)}</p>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 space-y-1">
                      <p className="capitalize">{selected.location.outcome} · {selected.location.solicitedDate}</p>
                      {selected.location.notes && <p className="text-xs text-slate-600">{selected.location.notes}</p>}
                    </div>
                  )}
                </div>
              </InfoWindow>
            )}
          </Map>
          {geocodingProgress && <div className="absolute bottom-3 left-3 rounded-md bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow dark:bg-slate-900/95 dark:text-slate-200">{geocodingProgress}</div>}
        </div>

        <aside className="min-h-0 space-y-4 xl:max-h-[calc(100vh-245px)] xl:overflow-y-auto xl:pr-1">
          <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <LocateFixed size={18} className="text-lagoon dark:text-cyan-300" />
              <h3 className="font-semibold text-ink dark:text-white">Record a solicitation</h3>
            </div>
            <form className="mt-4 space-y-3" onSubmit={submitSolicitation}>
              <label className="block text-sm font-semibold text-slate-600 dark:text-slate-300">
                Address
                <div className="mt-2 flex gap-2">
                  <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Click map or enter address" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal text-ink outline-none focus:border-lagoon dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                  <button type="button" className="icon-button shrink-0" title="Find address" aria-label="Find address" onClick={() => void locateTypedAddress().catch(() => setFormStatus("Address not found. Add the city or ZIP code and try again."))}><Search size={17} /></button>
                </div>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">Date<input type="date" value={solicitedDate} onChange={(event) => setSolicitedDate(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal text-ink outline-none focus:border-lagoon dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
                <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">Result<select value={outcome} onChange={(event) => setOutcome(event.target.value as SolicitationOutcome)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal capitalize text-ink outline-none focus:border-lagoon dark:border-slate-700 dark:bg-slate-950 dark:text-white">{outcomes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              </div>
              <label className="block text-sm font-semibold text-slate-600 dark:text-slate-300">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Name, interest, follow-up details..." className="mt-2 min-h-20 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal text-ink outline-none focus:border-lagoon dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <p className="min-h-8 text-xs leading-4 text-slate-500 dark:text-slate-400">{formStatus}</p>
              <button className="primary-button w-full gap-2" disabled={saving}><MapPin size={17} />{saving ? "Saving..." : "Save solicitation"}</button>
            </form>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-lagoon dark:text-cyan-300">Canvassing log</p><h3 className="font-semibold text-ink dark:text-white">{solicitations.length} doors tracked</h3></div>
              <select value={outcomeFilter} onChange={(event) => setOutcomeFilter(event.target.value as "all" | SolicitationOutcome)} className="max-w-32 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold capitalize text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"><option value="all">All results</option>{outcomes.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            </div>
            <div className="mt-3 space-y-2">
              {visibleSolicitations.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700">No solicitation pins match this filter.</p>}
              {visibleSolicitations.slice(0, 40).map((item) => (
                <article key={item.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <button type="button" className="w-full text-left" onClick={() => setSelected({ kind: "solicitation", location: item })}>
                    <div className="flex items-start gap-2"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: outcomeColors[item.outcome] }} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink dark:text-white">{item.address}</p><p className="text-xs text-slate-500">{item.solicitedDate}</p></div></div>
                  </button>
                  <div className="mt-2 flex items-center gap-2">
                    <select value={item.outcome} onChange={(event) => void onUpdateSolicitation(item.id, { outcome: event.target.value as SolicitationOutcome })} className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold capitalize text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">{outcomes.map((result) => <option key={result} value={result}>{result}</option>)}</select>
                    <button type="button" className="icon-button h-8 w-8 shrink-0" title="Delete solicitation" aria-label={`Delete solicitation at ${item.address}`} onClick={() => void onDeleteSolicitation(item.id)}><Trash2 size={15} /></button>
                  </div>
                  {item.notes && <p className="mt-2 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{item.notes}</p>}
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="metric-mini"><span>Jobs mapped</span><strong>{mappedJobCount} / {jobs.length}</strong><small className="block text-xs text-slate-500 dark:text-slate-400">{uniqueLocationCount} unique locations{jobsMissingAddresses > 0 ? `; ${jobsMissingAddresses} missing addresses` : ""}{locatingJobCount > 0 ? `; ${locatingJobCount} locating` : ""}</small></div>
        <div className="metric-mini"><span>Doors solicited</span><strong>{solicitations.length}</strong></div>
        <div className="metric-mini"><span>Interested / follow up</span><strong>{solicitations.filter((item) => item.outcome === "interested" || item.outcome === "follow up").length}</strong></div>
      </div>
    </div>
  );
}

export function BusinessMap(props: Props) {
  if (!apiKey) {
    return (
      <div className="grid min-h-[520px] place-items-center rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="max-w-lg text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-mist text-lagoon dark:bg-cyan-500/15 dark:text-cyan-200"><MapPin size={24} /></div>
          <h2 className="mt-4 text-xl font-bold text-ink dark:text-white">Google Maps is ready to connect</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Add the browser-restricted Google Maps key in Render as <code className="rounded bg-slate-100 px-1.5 py-1 text-xs dark:bg-slate-800">VITE_GOOGLE_MAPS_API_KEY</code>, then redeploy. Jobs and solicitation tracking will appear here.</p>
          <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><Check size={17} /> Database and canvassing tools configured</div>
        </div>
      </div>
    );
  }

  return <APIProvider apiKey={apiKey} region="US" libraries={["geocoding"]}><GoogleBusinessMap {...props} /></APIProvider>;
}
