'use client';
export const dynamic = 'force-dynamic';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TurnstileWidget } from '../components/TurnstileWidget';

type WorkType = 'Intern' | 'Full-time' | 'Contract';
type LocationType = 'Remote' | 'Hybrid' | 'Onsite';
type AuthRegion = 'US' | 'EU' | 'Remote Global';

const VALID_WORK_TYPES: WorkType[] = ['Intern', 'Full-time', 'Contract'];
const VALID_LOCATION_TYPES: LocationType[] = ['Remote', 'Hybrid', 'Onsite'];
const MAX_RESUME_SIZE_BYTES = 1024 * 1024; // 1 MB

// JD confirm page uses "On-site"; candidate page uses "Onsite"
function normalizeLocationType(loc: string): LocationType {
  const t = loc.trim();
  if (t === 'On-site') return 'Onsite';
  if (VALID_LOCATION_TYPES.includes(t as LocationType)) return t as LocationType;
  return 'Remote';
}

function CandidatePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobIdFromUrl = searchParams.get('jobId');

  // Form state
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [locations, setLocations] = useState<LocationType[]>([]);
  const [experience, setExperience] = useState<string>('');
  const [minCompensation, setMinCompensation] = useState<number>(50000);
  const [maxCompensation, setMaxCompensation] = useState<number>(150000);
  const [authRegions, setAuthRegions] = useState<AuthRegion[]>([]);
  const [resume, setResume] = useState<File | null>(null);
  const [githubUrl, setGithubUrl] = useState<string>('');
  const [projectLinks, setProjectLinks] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  // Honeypot: real users never see or fill this; bots do, and get rejected.
  const [hpField, setHpField] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');

  // JD-based lock: when jobId in URL, we fetch JD and lock work type + location to JD values from confirm page
  const [jdLoading, setJdLoading] = useState<boolean>(() => Boolean(jobIdFromUrl));
  const [jdLoadError, setJdLoadError] = useState<string | null>(null);
  const [workTypeLockedByJd, setWorkTypeLockedByJd] = useState(false);
  const [locationLockedByJd, setLocationLockedByJd] = useState(false);
  const [linkExpired, setLinkExpired] = useState(false);
  const [linkPaused, setLinkPaused] = useState(false);
  const [jdRoleFitOneLiner, setJdRoleFitOneLiner] = useState<string | null>(null);
  const workTypeLocked = Boolean(jobIdFromUrl && (jdLoading || workTypeLockedByJd));
  const locationLocked = Boolean(jobIdFromUrl && (jdLoading || locationLockedByJd));

  // Fetch JD when jobId is in URL; lock and set work type + location from JD (per JD confirmation page); check if link expired or paused
  useEffect(() => {
    if (!jobIdFromUrl) return;
    fetch(`/api/jd/${encodeURIComponent(jobIdFromUrl)}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Job not found' : 'Failed to load job');
        return res.json();
      })
      .then((jd: { 
        employment_type?: string; 
        location_type?: string; 
        isClosed?: boolean; 
        submissionCap?: number; 
        appliedCount?: number; 
        eigenCredits?: number;
        role_fit?: {
          title?: string;
          primary?: string[];
          secondary?: string[];
          tertiary?: string[];
          one_liner?: string;
        };
      }) => {
        setJdLoadError(null);
        setLinkExpired(false);
        setLinkPaused(false);
        const isClosed = Boolean(jd.isClosed);
        const cap = typeof jd.submissionCap === 'number' ? jd.submissionCap : 10;
        const applied = typeof jd.appliedCount === 'number' ? jd.appliedCount : 0;
        const eigenCredits = typeof jd.eigenCredits === 'number' ? jd.eigenCredits : 0;

        // Check if link is paused due to no eigenCredits
        if (eigenCredits === 0) {
          setLinkPaused(true);
        }
        // Check if link is expired (closed or cap reached)
        else if (isClosed || (cap > 0 && applied >= cap)) {
          setLinkExpired(true);
        }

        // Store JD role fit one-liner
        if (jd.role_fit && typeof jd.role_fit === 'object' && jd.role_fit.one_liner) {
          setJdRoleFitOneLiner(String(jd.role_fit.one_liner));
        }

        // Always lock work type and location to JD values when applying via job intake link
        const emp = jd.employment_type ? String(jd.employment_type).trim() : '';
        const workType: WorkType = emp && VALID_WORK_TYPES.includes(emp as WorkType) ? (emp as WorkType) : 'Full-time';
        setWorkTypes([workType]);
        setWorkTypeLockedByJd(true);

        const loc = jd.location_type ? String(jd.location_type).trim() : '';
        const location: LocationType = loc ? normalizeLocationType(loc) : 'Remote';
        setLocations([location]);
        setLocationLockedByJd(true);
      })
      .catch((err) => {
        setJdLoadError(err instanceof Error ? err.message : 'Failed to load job');
      })
      .finally(() => setJdLoading(false));
  }, [jobIdFromUrl]);

  // Block access without a valid intake link (jobId required)
  if (!jobIdFromUrl) {
    return (
      <div className="min-h-screen bg-white py-16 px-4 flex flex-col items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <div className="text-5xl mb-4">🔗</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Invalid intake link
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            This page can only be accessed through a valid intake link shared by an employer. Please use the link you received.
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Return to home
          </button>
        </div>
      </div>
    );
  }

  // Validating intake link
  if (jdLoading) {
    return (
      <div className="min-h-screen bg-white py-16 px-4 flex flex-col items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-gray-900 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Validating intake link...</p>
        </div>
      </div>
    );
  }

  // Invalid job (404 or fetch failed)
  if (jdLoadError) {
    return (
      <div className="min-h-screen bg-white py-16 px-4 flex flex-col items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <div className="text-5xl mb-4">🔗</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Invalid intake link
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            This intake link is invalid or the job no longer exists. Please request a new link from the employer.
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Return to home
          </button>
        </div>
      </div>
    );
  }

  // Toggle functions
  const toggleWorkType = (type: WorkType) => {
    setWorkTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const toggleLocation = (location: LocationType) => {
    setLocations(prev =>
      prev.includes(location) ? prev.filter(l => l !== location) : [...prev, location]
    );
  };

  const toggleAuthRegion = (region: AuthRegion) => {
    setAuthRegions(prev =>
      prev.includes(region) ? prev.filter(r => r !== region) : [...prev, region]
    );
  };

  // File upload handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file only');
      return;
    }
    if (file.size > MAX_RESUME_SIZE_BYTES) {
      alert('Resume must be 1 MB or smaller');
      return;
    }
    setResume(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file only');
      return;
    }
    if (file.size > MAX_RESUME_SIZE_BYTES) {
      alert('Resume must be 1 MB or smaller');
      return;
    }
    setResume(file);
  };

  // Validation and submit
  const validateForm = (): boolean => {
    const newErrors: string[] = [];

    if (!name.trim()) newErrors.push('Please enter your name');
    if (!email.trim()) newErrors.push('Please enter your email');
    if (workTypes.length === 0) newErrors.push('Please select at least one work type');
    if (locations.length === 0) newErrors.push('Please select at least one location preference');
    if (!experience) newErrors.push('Please select your years of experience');
    if (authRegions.length === 0) newErrors.push('Please select at least one work authorization region');
    if (!resume) newErrors.push('Please upload your resume');
    else if (resume.size > MAX_RESUME_SIZE_BYTES) newErrors.push('Resume must be 1 MB or smaller');
    
    // GitHub URL is mandatory only for <2 years experience
    if (experience === '<2' && !githubUrl.trim()) {
      newErrors.push('Please provide your GitHub repo URL');
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

 // Add this helper function outside or inside your component
 const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String =(reader.result as string).split(",")[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      // 1. Convert PDF to Base64 string so it survives sessionStorage
      let resumeBase64 = "";
      if (resume) {
        resumeBase64 = await fileToBase64(resume);
      }

      // 2. Prepare the payload
      const formData = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        workTypes,
        locations,
        experience,
        minCompensation,
        maxCompensation,
        authRegions,
        resumeName: resume?.name,
        resumeBase64, // <--- NOW WE HAVE THE FILE DATA
        githubUrl,
        projectLinks,
        website: hpField, // honeypot — server rejects if non-empty
        turnstileToken, // Cloudflare Turnstile token (verified server-side)
        ...(jobIdFromUrl ? { jobId: jobIdFromUrl } : {}),
      };
      if (typeof window !== 'undefined') {
        // Warning: sessionStorage has a limit (~5MB). 
        // 1-2 page text PDFs are usually fine (~50-100KB).
        sessionStorage.setItem('candidateFormData', JSON.stringify(formData));
        router.push('/candidate/processing');
      }
    } catch (error) {
      console.error("Error preparing application:", error);
      alert("Something went wrong preparing your file. Please try again.");
    }
  };

  // Intake link paused: eigenCredits are 0
  if (jobIdFromUrl && !jdLoading && linkPaused) {
    return (
      <div className="min-h-screen bg-white py-16 px-4 flex flex-col items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <div className="text-5xl mb-4">⏸️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            This role is temporarily unavailable
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            Applications for this role are temporarily paused. Please check back later—this intake link will be active again soon.
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Return to home
          </button>
        </div>
      </div>
    );
  }

  // Intake link expired: matching done or applicant limit reached
  if (jobIdFromUrl && !jdLoading && linkExpired) {
    return (
      <div className="min-h-screen bg-white py-16 px-4 flex flex-col items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            This intake link is no longer accepting applications
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            Submissions for this role have closed—either the applicant limit has been reached or matching has been completed.
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Return to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Candidate Application
          </h1>
          <p className="text-gray-500 text-sm">
            Share your preferences and details with us
          </p>
        </div>

        {/* JD Role Fit One-Liner */}
        {jdRoleFitOneLiner && (
          <div className="mb-8 bg-gray-50 rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Role
            </h2>
            <p className="text-base text-gray-900">{jdRoleFitOneLiner}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-12">
          {/* Honeypot — visually hidden; bots fill it and are rejected server-side. */}
          <input
            type="text"
            name="website"
            value={hpField}
            onChange={(e) => setHpField(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 }}
          />
          {/* Identity */}
          <div className="space-y-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              Your details
            </h2>
            <div className="mb-4">
              <label className="block text-sm text-gray-600 mb-3">
                Name <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="w-full max-w-md px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200 bg-white placeholder:text-gray-400"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm text-gray-600 mb-3">
                Email <span className="text-red-600">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full max-w-md px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200 bg-white placeholder:text-gray-400"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm text-gray-600 mb-3">
                Phone <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number"
                className="w-full max-w-md px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200 bg-white placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Section 1: Preferences */}
          <div className="space-y-8">
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-6">
                Preferences
              </h2>

              {/* Work Type — read-only only when JD specifies employment_type */}
              <div className="mb-6">
                <label className="block text-sm text-gray-600 mb-3">
                  Work Type
                </label>
                {jdLoadError && jobIdFromUrl && (
                  <p className="text-sm text-amber-600 mb-2">{jdLoadError}</p>
                )}
                {jdLoading && jobIdFromUrl && (
                  <p className="text-sm text-gray-500 mb-2">Loading job details…</p>
                )}
                <div className={`flex flex-wrap gap-2 ${workTypeLocked ? 'cursor-not-allowed' : ''}`}>
                  {(VALID_WORK_TYPES).map(type => (
                    <button
                      key={type}
                      type="button"
                      disabled={workTypeLocked}
                      onClick={workTypeLocked ? undefined : () => toggleWorkType(type)}
                      className={`px-3 py-1.5 rounded-md text-sm transition-all ${
                        workTypeLocked
                          ? workTypes.includes(type)
                            ? 'bg-gray-400 text-gray-100 cursor-not-allowed'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : workTypes.includes(type)
                            ? 'bg-gray-900 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Location — read-only only when JD specifies location_type */}
              <div className="mb-6">
                <label className="block text-sm text-gray-600 mb-3">
                  Location
                </label>
                <div className={`flex flex-wrap gap-2 ${locationLocked ? 'cursor-not-allowed' : ''}`}>
                  {(VALID_LOCATION_TYPES).map(location => (
                    <button
                      key={location}
                      type="button"
                      disabled={locationLocked}
                      onClick={locationLocked ? undefined : () => toggleLocation(location)}
                      className={`px-3 py-1.5 rounded-md text-sm transition-all ${
                        locationLocked
                          ? locations.includes(location)
                            ? 'bg-gray-400 text-gray-100 cursor-not-allowed'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : locations.includes(location)
                            ? 'bg-gray-900 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {location}
                    </button>
                  ))}
                </div>
              </div>

              {/* Years of Experience */}
              <div className="mb-6">
                <label className="block text-sm text-gray-600 mb-3">
                  Years of Experience
                </label>
                <select
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  className="w-full max-w-xs px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200 bg-white"
                >
                  <option value="">Select experience</option>
                  <option value="<2">&lt;2 years</option>
                  <option value=">=2">&gt;=2 years</option>
                </select>
              </div>

              {/* Preferred Compensation Range */}
              <div>
                <label className="block text-sm text-gray-600 mb-3">
                  Preferred Compensation Range
                </label>
                <div className="max-w-md space-y-3">
                  {/* Display range */}
                  <div className="flex items-center justify-between">
                    <input
                      type="number"
                      min="0"
                      max={maxCompensation}
                      step="5000"
                      value={minCompensation}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (value <= maxCompensation) {
                          setMinCompensation(value);
                        }
                      }}
                      className="w-28 px-2 py-1 text-xs text-gray-900 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-300"
                    />
                    <span className="text-xs text-gray-400">to</span>
                    <input
                      type="number"
                      min={minCompensation}
                      max="500000"
                      step="5000"
                      value={maxCompensation}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (value >= minCompensation) {
                          setMaxCompensation(value);
                        }
                      }}
                      className="w-28 px-2 py-1 text-xs text-gray-900 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-300"
                    />
                  </div>

                  {/* Dual Range Slider */}
                  <div className="relative h-5 flex items-center">
                    <div className="absolute w-full h-0.5 bg-gray-200 rounded">
                      <div 
                        className="absolute h-0.5 bg-gray-900"
                        style={{
                          left: `${(minCompensation / 500000) * 100}%`,
                          right: `${100 - (maxCompensation / 500000) * 100}%`
                        }}
                      />
                    </div>
                    
                    <input
                      type="range"
                      min="0"
                      max="500000"
                      step="5000"
                      value={minCompensation}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (value <= maxCompensation) {
                          setMinCompensation(value);
                        }
                      }}
                      className="absolute w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-gray-900 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-gray-900 [&::-moz-range-thumb]:cursor-pointer"
                    />
                    
                    <input
                      type="range"
                      min="0"
                      max="500000"
                      step="5000"
                      value={maxCompensation}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (value >= minCompensation) {
                          setMaxCompensation(value);
                        }
                      }}
                      className="absolute w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-gray-900 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-gray-900 [&::-moz-range-thumb]:cursor-pointer"
                    />
                  </div>

                  <div className="text-xs text-gray-400 text-center">
                    Annual salary: ${minCompensation.toLocaleString()} - ${maxCompensation.toLocaleString()} USD
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Work Authorization */}
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900 mb-6">
              Work Authorization
            </h2>
            
            <div>
              <label className="block text-sm text-gray-600 mb-3">
                I am authorized to work in:
              </label>
              <div className="space-y-3">
                {(['US', 'EU', 'Remote Global'] as AuthRegion[]).map(region => (
                  <label
                    key={region}
                    className="flex items-center space-x-3 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={authRegions.includes(region)}
                      onChange={() => toggleAuthRegion(region)}
                      className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900 focus:ring-offset-0"
                    />
                    <span className="text-sm text-gray-700 group-hover:text-gray-900">{region}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Section 3: The Artifacts */}
          <div className="space-y-6">
            <h2 className="text-base font-semibold text-gray-900 mb-6">
              The Artifacts
            </h2>

            {/* Resume Upload */}
            <div>
              <label className="block text-sm text-gray-600 mb-3">
                Resume Upload
              </label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border border-dashed rounded-lg p-8 text-center transition-all ${
                  isDragging
                    ? 'border-gray-400 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {resume ? (
                  <div className="space-y-2">
                    <div className="text-gray-900 text-sm">
                      ✓ {resume.name}
                    </div>
                    <button
                      type="button"
                      onClick={() => setResume(null)}
                      className="text-xs text-gray-500 hover:text-gray-900"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-sm text-gray-600">
                      Drop your resume here, or click to browse
                    </div>
                    <label className="inline-block">
                      <span className="px-4 py-1.5 bg-gray-900 text-white text-sm rounded-md cursor-pointer hover:bg-gray-800 transition-colors">
                        Choose file
                      </span>
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={handleFileInput}
                        className="hidden"
                      />
                    </label>
                    <div className="text-xs text-gray-400">
                      PDF only, max 1 MB
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* GitHub URL - Only show for <2 years experience */}
            {experience === '<2' && (
              <div>
                <label className="block text-sm text-gray-600 mb-3">
                  GitHub Repo URL <span className="text-red-600">*</span>
                </label>
                <input
                  type="url"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/username/repo"
                  className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder:text-gray-400"
                />
              </div>
            )}

            {/* Project Live Links */}
            <div>
              <label className="block text-sm text-gray-600 mb-3">
                Project Live Links <span className="text-sm font-medium text-gray-900 bg-yellow-50 px-2 py-0.5 rounded">(only add if mentioned in resume)</span>
              </label>
              <textarea
                value={projectLinks}
                onChange={(e) => setProjectLinks(e.target.value)}
                placeholder="Add project URLs, one per line"
                rows={4}
                className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder:text-gray-400 resize-none"
              />
              <div className="text-xs text-gray-400 mt-1">
                Enter each project link on a new line
              </div>
            </div>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-4">
              <div className="text-sm font-medium text-red-900 mb-2">
                Please fix the following:
              </div>
              <ul className="space-y-1">
                {errors.map((error) => (
                  <li key={error} className="text-sm text-red-700 flex items-start">
                    <span className="mr-2">•</span>
                    <span>{error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Bot challenge (Cloudflare Turnstile; renders nothing if not configured) */}
          <TurnstileWidget onToken={setTurnstileToken} className="pt-2" />

          {/* Submit Button */}
          <div className="pt-4">
            <button
              type="submit"
              className="px-6 py-2 bg-gray-900 text-white text-sm rounded-md font-medium hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
            >
              Submit Application
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CandidatePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center">Loading…</div>}>
      <CandidatePageContent />
    </Suspense>
  );
}