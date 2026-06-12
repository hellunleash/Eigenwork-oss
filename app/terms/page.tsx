import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service & Privacy Policy",
  description: "Terms of Service and Privacy Policy for EigenWork platform.",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

// Force static generation for crawler accessibility
export const dynamic = 'force-static';
export const revalidate = false;

export default function TermsPage() {
  // Use static date for SSR compatibility
  const lastUpdated = "February 11, 2025";
  
  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0e] py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">Terms of Service & Privacy Policy</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Last updated: {lastUpdated}</p>

        <div className="prose prose-sm max-w-none space-y-8">
          {/* TERMS OF SERVICE */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Terms of Service</h2>
            
            <div className="space-y-6 text-gray-700 dark:text-gray-300 leading-relaxed">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">1. Acceptance of Terms</h3>
                <p>
                  These Terms of Service and Privacy Policy (&quot;Terms&quot;) are entered into between you (&quot;User&quot;, &quot;you&quot;, &quot;your&quot;) and EigenWork (&quot;EigenWork&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;, &quot;Company&quot;). By accessing or using EigenWork (&quot;the Platform&quot;, &quot;Service&quot;), you agree to be bound by these Terms. If you do not agree, please do not use the Platform.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">2. Description of Service</h3>
                <p>
                  EigenWork is a technical candidate evaluation platform designed for startups. The Platform enables users to:
                </p>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>Create job role descriptions and generate intake links</li>
                  <li>Receive candidate applications through intake links</li>
                  <li>Automatically evaluate candidates using our EigenTrustIndex (ETI) scoring system</li>
                  <li>View evaluation results, including ETI scores, role fit assessments, and candidate profiles</li>
                </ul>
                <p className="mt-2">
                  The Platform uses artificial intelligence (AI) models, including Google Gemini AI, to analyze candidate resumes and other submitted materials to generate evaluation scores and insights. For junior candidates, GitHub repositories are analyzed using metadata and locally-computed (CPU-only) pattern counts; repository code itself is not sent to the AI model (see the Privacy Policy for details). The Platform does not make hiring decisions on your behalf—it provides evaluation data to assist your decision-making process.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">3. Account Creation and Authentication</h3>
                <p>
                  To use the Platform as a user, you must create an account using Google OAuth authentication. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">4. EigenCredits and Payment Processing</h3>
                <p>
                  EigenWork operates on a credit-based system. You purchase EigenCredits, which are consumed when candidates submit applications through your intake links. Each candidate evaluation consumes one EigenCredit.
                </p>
                <p className="mt-2">
                  Payments are processed through Paddle.com (&quot;Paddle&quot;), a third-party payment processor. By purchasing EigenCredits, you agree to Paddle&apos;s terms of service and privacy policy, which are available at https://paddle.com/legal.
                </p>
                <p className="mt-2">
                  <strong>Refund Policy:</strong> EigenWork offers refunds in accordance with Paddle&apos;s refund policy and applicable consumer protection laws. If you are not satisfied with your purchase, you may request a refund within 14 days of purchase by contacting Paddle&apos;s customer support. Refund requests will be processed in accordance with Paddle&apos;s standard refund procedures. Once a refund is approved, Paddle will process the refund to your original payment method within 5-10 business days.
                </p>
                <p className="mt-2">
                  EigenCredits do not expire, but they are non-transferable. If your account has zero EigenCredits, intake links will be paused until you purchase additional credits.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">5. Candidate Data and Evaluation</h3>
                <p>
                  When candidates apply through your intake links, they provide personal information, resumes, GitHub repository URLs (optional), project links, work preferences, and compensation expectations. This data is processed using AI models to generate ETI scores and evaluation insights.
                </p>
                <p className="mt-2">
                  ETI scores are calculated using multiple evaluation blocks:
                </p>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li><strong>For Junior Candidates:</strong> ESQ (Evidence of Skill Quality), PDQ (Problem-solving, Decision-making, Quality), and NR (Narrative Realism)</li>
                  <li><strong>For Senior Candidates:</strong> OM (Operating Maturity), OD (Operating Depth), and PC (Performance Capacity)</li>
                </ul>
                <p className="mt-2">
                  Scores are normalized to a 0-100 scale. Candidates with scores below 50 are not considered matchable. The Platform also performs role-fit matching using AI to compare candidate profiles against job descriptions.
                </p>
                <p className="mt-2">
                  <strong>Important:</strong> ETI scores and evaluations are generated by AI models and are provided for informational purposes only. We do not guarantee the accuracy, completeness, or reliability of any evaluation results. You are solely responsible for making hiring decisions based on the information provided.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">6. Use of AI APIs and Third-Party Services</h3>
                <p>
                  The Platform uses the following third-party AI and data processing services:
                </p>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li><strong>Google Gemini AI (gemini-2.5-flash):</strong> Used for candidate evaluation, role-fit matching, and job description parsing</li>
                  <li><strong>Google Document AI:</strong> Used to extract text from resume PDFs</li>
                  <li><strong>GitHub API:</strong> Used to read repository metadata and code for junior candidates (when GitHub URLs are provided); code is processed locally for pattern counting and is not sent to the AI model</li>
                  <li><strong>Firebase (Google):</strong> Used for authentication, data storage (Firestore), and file storage (Storage)</li>
                  <li><strong>Paddle:</strong> Used for payment processing</li>
                </ul>
                <p className="mt-2">
                  By using the Platform, you acknowledge that candidate data may be processed by these third-party services in accordance with their respective privacy policies and terms of service.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">7. Acceptable Use</h3>
                <p>You agree not to:</p>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>Use the Platform for any illegal or unauthorized purpose</li>
                  <li>Submit false, misleading, or fraudulent information</li>
                  <li>Interfere with or disrupt the Platform&apos;s operation or security</li>
                  <li>Attempt to reverse engineer, decompile, or extract source code from the Platform</li>
                  <li>Use automated systems to scrape or harvest data from the Platform</li>
                  <li>Share intake links in a manner that violates applicable employment or anti-discrimination laws</li>
                  <li>Use the Platform to discriminate against candidates based on protected characteristics</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">8. Intellectual Property</h3>
                <p>
                  The Platform, including its design, functionality, ETI scoring algorithms, and evaluation methodologies, is the property of EigenWork (&quot;EigenWork&quot;, &quot;the Company&quot;) and its licensors. You may not copy, modify, distribute, or create derivative works based on the Platform without EigenWork&apos;s express written permission.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">9. Disclaimers and Limitations of Liability</h3>
                <p>
                  <strong>No Guarantees:</strong> The Platform is provided &quot;as is&quot; without warranties of any kind. We do not guarantee that:
                </p>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>ETI scores accurately reflect candidate qualifications or potential</li>
                  <li>Evaluations will result in successful hires</li>
                  <li>The Platform will be error-free, secure, or continuously available</li>
                  <li>AI-generated insights are accurate or complete</li>
                </ul>
                <p className="mt-2">
                  <strong>Limitation of Liability:</strong> To the maximum extent permitted by law, EigenWork and its affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including lost profits, data loss, or business interruption, arising from your use of the Platform.
                </p>
                <p className="mt-2">
                  <strong>Hiring Decisions:</strong> You are solely responsible for all hiring decisions. The Platform provides evaluation tools and data, but does not make hiring decisions on your behalf. We are not responsible for the outcomes of your hiring decisions.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">10. Termination</h3>
                <p>
                  We reserve the right to suspend or terminate your account at any time for violation of these Terms or for any other reason we deem necessary. Upon termination, your access to the Platform will cease, but candidate data associated with your account may be retained as described in our Privacy Policy.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">11. Changes to Terms</h3>
                <p>
                  We may modify these Terms at any time. Material changes will be notified through the Platform or via email. Continued use of the Platform after changes constitutes acceptance of the modified Terms.
                </p>
              </div>
            </div>
          </section>

          {/* PRIVACY POLICY */}
          <section className="mt-12">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Privacy Policy</h2>
            
            <div className="space-y-6 text-gray-700 dark:text-gray-300 leading-relaxed">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">1. Information We Collect</h3>
                
                <p className="font-medium mt-3">User Account Information:</p>
                <ul className="list-disc pl-6 mt-1 space-y-1">
                  <li>Google account information (email, name) obtained through OAuth authentication</li>
                  <li>User ID and account creation timestamp</li>
                  <li>EigenCredits balance and purchase history</li>
                </ul>

                <p className="font-medium mt-3">Job Description Data:</p>
                <ul className="list-disc pl-6 mt-1 space-y-1">
                  <li>Job title, seniority level, role category</li>
                  <li>Technical stack requirements (primary, secondary, tertiary)</li>
                  <li>Location type, employment type, years of experience required</li>
                  <li>Work authorization requirements</li>
                  <li>Submission cap and role fit parameters</li>
                </ul>

                <p className="font-medium mt-3">Candidate Application Data:</p>
                <ul className="list-disc pl-6 mt-1 space-y-1">
                  <li>Personal information: name, email address, phone number (optional)</li>
                  <li>Resume files (PDF format) uploaded by candidates</li>
                  <li>GitHub repository URLs (optional, for junior candidates)</li>
                  <li>Project portfolio links</li>
                  <li>Work preferences: work types, location preferences, compensation expectations</li>
                  <li>Experience level and years of experience</li>
                  <li>Work authorization regions</li>
                  <li>ETI evaluation scores, role-fit assessments, and evaluation breakdowns</li>
                </ul>

                <p className="font-medium mt-3">Technical Data:</p>
                <ul className="list-disc pl-6 mt-1 space-y-1">
                  <li>IP addresses and browser information</li>
                  <li>Usage logs and analytics data</li>
                  <li>Session storage data (temporarily stored during application submission)</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">2. How We Use Your Information</h3>
                <p>We use collected information to:</p>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>Provide and operate the Platform</li>
                  <li>Process candidate applications and generate ETI evaluations</li>
                  <li>Perform role-fit matching between candidates and job descriptions</li>
                  <li>Process payments and manage EigenCredits</li>
                  <li>Authenticate users and manage accounts</li>
                  <li>Store resumes and candidate data securely</li>
                  <li>Improve Platform functionality and user experience</li>
                  <li>Comply with legal obligations and enforce our Terms</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">3. Data Processing and AI Services</h3>
                <p>
                  Candidate data is processed using third-party AI services:
                </p>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li><strong>Resume Processing:</strong> Resume PDFs are sent to Google Document AI to extract text content. The extracted text is then processed by Google Gemini AI for evaluation.</li>
                  <li><strong>GitHub Analysis:</strong> For junior candidates who provide GitHub URLs, we access their public repositories via the GitHub API and analyze repository <strong>metadata</strong> (file structure, commit history, dependency manifests) together with <strong>pattern counts</strong> derived from automated text/regex matching over the code. This pattern counting runs locally on our servers (CPU only). Repository <strong>file content is never sent to the LLM (Google Gemini)</strong>; only the resulting non-code signal summary is used to generate ESQ scores.</li>
                  <li><strong>Evaluation:</strong> Candidate information, resume text, and the GitHub <strong>signal summary</strong> described above (when available, never raw repository code) are sent to Google Gemini AI to generate ETI scores, role-fit assessments, and evaluation breakdowns.</li>
                  <li><strong>Role Matching:</strong> Job descriptions and candidate profiles are compared using Google Gemini AI to determine role-fit compatibility.</li>
                </ul>
                <p className="mt-2">
                  All data sent to AI services is processed according to Google&apos;s privacy policies and terms of service. We do not use candidate data to train AI models beyond the scope of generating evaluations for your specific job postings.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">4. Data Storage</h3>
                <p>
                  All data is stored using Google Firebase services:
                </p>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li><strong>Firestore:</strong> Stores account information, job descriptions, candidate profiles, evaluation results, and metadata</li>
                  <li><strong>Firebase Storage:</strong> Stores resume PDF files securely</li>
                  <li><strong>Firebase Auth:</strong> Manages user authentication and session data</li>
                </ul>
                <p className="mt-2">
                  Data is stored in Google Cloud infrastructure and is subject to Google&apos;s security and privacy practices. We implement industry-standard security measures to protect your data, but no system is completely secure.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">5. Data Sharing and Disclosure</h3>
                <p>We do not sell your personal information. We may share data only in the following circumstances:</p>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li><strong>With Service Providers:</strong> We share data with third-party service providers (Google, Paddle, GitHub) necessary to operate the Platform, as described in Section 3</li>
                  <li><strong>With Users:</strong> Candidate application data and evaluation results are accessible to the user who created the job posting through which the candidate applied</li>
                  <li><strong>Legal Requirements:</strong> We may disclose data if required by law, court order, or government regulation</li>
                  <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, data may be transferred to the acquiring entity</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">6. Cookies and Tracking</h3>
                <p>
                  The Platform uses session storage to temporarily store form data during the candidate application process. We do not use persistent cookies for tracking purposes. Firebase Auth may use cookies for session management. Paddle may use cookies for payment processing functionality.
                </p>
                <p className="mt-2">
                  You can control cookie settings through your browser preferences. Disabling cookies may affect Platform functionality.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">7. Data Retention</h3>
                <p>
                  We retain your data for as long as necessary to provide the Platform and comply with legal obligations:
                </p>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li><strong>Account Data:</strong> Retained while your account is active and for a reasonable period after account closure</li>
                  <li><strong>Job Descriptions:</strong> Retained until you delete them or close your account</li>
                  <li><strong>Candidate Data:</strong> Retained until you delete the associated job posting or request deletion</li>
                  <li><strong>Resume Files:</strong> Stored in Firebase Storage until deleted by you or upon account closure</li>
                </ul>
                <p className="mt-2">
                  You can delete job postings and candidate data through the Platform dashboard. Deletion requests will be processed within 30 days.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">8. Your Privacy Rights (GDPR/CCPA)</h3>
                <p>If you are located in the European Economic Area (EEA), United Kingdom, or California, you have the following rights:</p>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li><strong>Access:</strong> Request a copy of your personal data</li>
                  <li><strong>Rectification:</strong> Request correction of inaccurate or incomplete data</li>
                  <li><strong>Erasure:</strong> Request deletion of your personal data (&quot;right to be forgotten&quot;)</li>
                  <li><strong>Restriction:</strong> Request limitation of processing in certain circumstances</li>
                  <li><strong>Data Portability:</strong> Request transfer of your data to another service provider</li>
                  <li><strong>Objection:</strong> Object to processing of your data for certain purposes</li>
                  <li><strong>Withdraw Consent:</strong> Withdraw consent for data processing where consent is the legal basis</li>
                </ul>
                <p className="mt-2">
                  To exercise these rights, please contact us at: <strong>[eigenwork.team@gmail.com]</strong>
                </p>
                <p className="mt-2">
                  <strong>California Residents:</strong> Under the California Consumer Privacy Act (CCPA), you have the right to know what personal information we collect, the right to delete personal information, and the right to opt-out of the sale of personal information (we do not sell personal information). You will not be discriminated against for exercising your privacy rights.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">9. Security</h3>
                <p>
                  We implement technical and organizational measures to protect your data, including:
                </p>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>Encryption of data in transit (HTTPS/TLS)</li>
                  <li>Secure authentication via Firebase Auth</li>
                  <li>Access controls and authentication requirements</li>
                  <li>Regular security assessments</li>
                  <li>Secure storage of resume files in Firebase Storage</li>
                </ul>
                <p className="mt-2">
                  However, no method of transmission or storage is 100% secure. You use the Platform at your own risk.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">10. Children&apos;s Privacy</h3>
                <p>
                  The Platform is not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">11. International Data Transfers</h3>
                <p>
                  Your data may be processed and stored in the United States and other countries where our service providers operate. By using the Platform, you consent to the transfer of your data to these jurisdictions, which may have different data protection laws than your country of residence.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">12. Changes to Privacy Policy</h3>
                <p>
                  We may update this Privacy Policy from time to time. Material changes will be notified through the Platform or via email. Continued use of the Platform after changes constitutes acceptance of the updated Privacy Policy.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">13. Contact Us</h3>
                <p>
                  If you have questions about these Terms or our Privacy Policy, please contact EigenWork at:
                </p>
                <p className="mt-2">
                  <strong>Company Name:</strong> EigenWork<br />
                  <strong>Email:</strong> [eigenwork.team@gmail.com]<br />
                  <strong>Address:</strong> [NEW DELHI, INDIA]
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
